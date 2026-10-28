// Прогон evals: npm run evals [-- --case <id>] [-- --repeat <n>]
// Нужен DEEPSEEK_API_KEY — в окружении или в .env в корне проекта.
// Результат — в консоли и в evals/report.md. Код выхода 1, если хоть один сценарий не прошёл.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { AGENT } from '../n8n/build.mjs'
import { runTurn } from './agent.mjs'
import { CASES } from './cases.mjs'
import { judge, PASS_SCORE } from './judge.mjs'

const CONCURRENCY = 3

const { values } = parseArgs({ options: { case: { type: 'string' }, repeat: { type: 'string', default: '1' } } })
const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('Нет DEEPSEEK_API_KEY: добавьте его в .env в корне проекта.')
  process.exit(2)
}

const selected = values.case ? CASES.filter((testCase) => testCase.id === values.case) : CASES
if (!selected.length) {
  console.error(`Нет сценария «${values.case}». Есть: ${CASES.map((testCase) => testCase.id).join(', ')}`)
  process.exit(2)
}
const runs = selected.flatMap((testCase) =>
  Array.from({ length: Number(values.repeat) }, (_, attempt) => ({ testCase, attempt })),
)

async function runCase({ testCase, attempt }) {
  const history = []
  const answers = []
  const allToolCalls = []
  let last
  try {
    for (const userMessage of testCase.turns) {
      last = await runTurn({ history, userMessage, apiKey, api: testCase.api })
      if (last.error) throw new Error(last.error)
      history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: last.answer })
      answers.push(last.answer)
      allToolCalls.push(...last.toolCalls)
    }
    const checks = testCase.checks.map((check) => ({ name: check.name, ...check.run(last, allToolCalls) }))
    const verdict = await judge({ turns: testCase.turns, answers, toolCalls: allToolCalls, apiKey })
    const pass = checks.every((check) => check.pass) && verdict.score >= PASS_SCORE
    return { testCase, attempt, pass, checks, verdict, answers, toolCalls: allToolCalls }
  } catch (error) {
    return { testCase, attempt, pass: false, checks: [], verdict: null, answers, error: error.message }
  }
}

// Несколько сценариев параллельно, но не все сразу — чтобы не упереться в лимиты API.
async function runAll(items) {
  const results = []
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      const result = await runCase(item)
      console.log(`${result.pass ? '✓' : '✗'} ${result.testCase.id}${result.error ? ` — ${result.error}` : ''}`)
      results.push(result)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results.sort((a, b) => selected.indexOf(a.testCase) - selected.indexOf(b.testCase) || a.attempt - b.attempt)
}

const started = new Date()
const results = await runAll(runs)

const passed = results.filter((result) => result.pass).length
const allChecks = results.flatMap((result) => result.checks)
const scores = results.map((result) => result.verdict?.score).filter(Number.isFinite)
const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—'
const summary = `Сценариев пройдено: ${passed} из ${results.length}. Проверок пройдено: ${allChecks.filter((check) => check.pass).length} из ${allChecks.length}. Средняя оценка судьи: ${average} из 5.`
console.log(`\n${summary}`)

const cell = (text) => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>')
const lines = [
  '# Результаты evals',
  '',
  `${started.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК) · модель ${AGENT.model}, температура ${AGENT.temperature} · повторов на сценарий: ${values.repeat}`,
  '',
  summary,
  '',
  '| Сценарий | Проверки | Судья | Итог |',
  '| --- | --- | --- | --- |',
  ...results.map((result) => {
    const ok = result.checks.filter((check) => check.pass).length
    return `| ${result.testCase.id} — ${cell(result.testCase.about)} | ${ok} из ${result.checks.length} | ${result.verdict?.score ?? '—'} | ${result.pass ? '✓' : '✗'} |`
  }),
  '',
  '## Подробности',
  '',
  ...results.flatMap((result) => [
    `### ${result.pass ? '✓' : '✗'} ${result.testCase.id}`,
    '',
    ...result.testCase.turns.flatMap((turn, i) => [
      `**Пользователь:** ${cell(turn)}`,
      '',
      `**Бот:** ${cell(result.answers[i] ?? '')}`,
      '',
    ]),
    ...(result.error ? [`Ошибка прогона: ${result.error}`, ''] : []),
    ...(result.toolCalls?.length
      ? [`Инструменты: ${result.toolCalls.map((call) => `\`${call.name}(${JSON.stringify(call.args)})\``).join(', ')}`, '']
      : []),
    ...result.checks.map((check) => `- ${check.pass ? '✓' : '✗'} ${check.name}${check.detail && !check.pass ? ` — ${cell(check.detail)}` : ''}`),
    ...(result.verdict ? ['', `Судья: ${result.verdict.score} из 5 — ${cell(result.verdict.reason)}`] : []),
    '',
  ]),
]
writeFileSync(new URL('./report.md', import.meta.url), lines.join('\n'))
process.exit(passed === results.length ? 0 : 1)

// Агент из сценария n8n, воспроизведённый вне n8n: тот же промпт, те же настройки
// и тот же код инструментов (n8n/build.mjs), та же модель DeepSeek с вызовом функций.
// Память — как у Simple Memory в n8n: только реплики пользователя и агента, без вызовов инструментов.
import { AGENT, SYSTEM_MESSAGE, TOOLS, toolCode } from '../n8n/build.mjs'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const AsyncFunction = (async () => {}).constructor

// То, что инструментам нужно от this.helpers.httpRequest в n8n.
async function httpRequest({ url, qs, timeout }) {
  const requestUrl = new URL(url)
  requestUrl.search = new URLSearchParams(qs)
  const response = await fetch(requestUrl, { signal: AbortSignal.timeout(timeout) })
  const text = await response.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    // не JSON — инструмент разберётся сам
  }
  return { statusCode: response.status, body }
}

export async function chat(messages, { apiKey, tools, temperature = AGENT.temperature, json = false }) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: AGENT.model,
      messages,
      temperature,
      ...(tools && { tools }),
      ...(json && { response_format: { type: 'json_object' } }),
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${await response.text()}`)
  return (await response.json()).choices[0].message
}

const toolDefinitions = TOOLS.map(({ name, description, inputSchema }) => ({
  type: 'function',
  function: { name, description, parameters: inputSchema },
}))

// Один ход диалога. api — подмена API Favorit для сценариев с ошибками: (qs) => ответ или исключение.
// Возвращает ответ агента и все вызовы инструментов с аргументами и результатами.
export async function runTurn({ history, userMessage, apiKey, api }) {
  const helpers = { httpRequest: api ? async ({ qs }) => api(qs) : httpRequest }
  const messages = [
    { role: 'system', content: SYSTEM_MESSAGE },
    ...history.slice(-AGENT.memoryWindow),
    { role: 'user', content: userMessage },
  ]
  const toolCalls = []

  for (let step = 0; step < AGENT.maxIterations; step++) {
    const message = await chat(messages, { apiKey, tools: toolDefinitions })
    messages.push(message)
    if (!message.tool_calls?.length) return { answer: message.content ?? '', toolCalls }

    for (const call of message.tool_calls) {
      let args = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        // модель прислала не JSON — инструмент получит пустой вход и вернёт ошибку
      }
      const code = toolCode(call.function.name.replaceAll('_', '-'))
      const output = await new AsyncFunction('query', code).call({ helpers }, args)
      toolCalls.push({ name: call.function.name, args, output })
      messages.push({ role: 'tool', tool_call_id: call.id, content: output })
    }
  }
  return { answer: '', toolCalls, error: `Агент не ответил за ${AGENT.maxIterations} шагов` }
}

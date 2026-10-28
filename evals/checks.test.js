// @vitest-environment node
// Проверки evals тоже код — если они врут, врут и результаты evals.
import { describe, expect, it } from 'vitest'
import { checks as c, pricesInText, pricesInToolOutputs } from './checks.mjs'

const brands = {
  name: 'find_part_brands',
  args: { number: '01089' },
  output: JSON.stringify({
    query: '01089',
    brands: [
      { brand: 'ASAM', number: '01089', stock: 29, minPrice: 86.88, bestWarehouse: { price: 86.88 } },
      { brand: 'FEBI', number: '01089', stock: 849, minPrice: 1082, bestWarehouse: { price: 1082 } },
    ],
  }),
}

const offers = {
  name: 'get_part_offers',
  args: { brand: 'FEBI', number: '01089', inStockOnly: true },
  output: JSON.stringify({
    original: { brand: 'FEBI', number: '01089', stock: 849, minPrice: 1082 },
    analogues: [
      { brand: 'Miles', number: 'AFB1', stock: 262, minPrice: 213.71 },
      { brand: 'GREENCOOL', number: '791968', stock: 18, minPrice: 217.54 },
      { brand: 'X', number: 'X1', stock: 0, minPrice: null },
    ],
    analoguesTotal: 107,
  }),
}

const run = (check, answer, toolCalls = [brands, offers]) => check.run({ answer, toolCalls }, toolCalls)

describe('Разбор цен', () => {
  it('находит цены в разных записях', () => {
    expect(pricesInText('FEBI — 1 082 ₽, Miles — 213,71 ₽, ASAM — 86.88 руб., склад 30.10')).toEqual([
      1082, 213.71, 86.88,
    ])
    expect(pricesInText('от 1 314,00 ₽')).toEqual([1314])
  })

  it('не принимает количество и даты за цены', () => {
    expect(pricesInText('71 шт., отгрузка 30.10, всего 107 аналогов')).toEqual([])
  })

  it('собирает цены из ответов инструментов на любой глубине', () => {
    expect([...pricesInToolOutputs([brands, offers])].sort((a, b) => a - b)).toEqual([86.88, 213.71, 217.54, 1082])
  })
})

describe('Проверки', () => {
  it('noInventedPrices ловит цену, которой нет в API', () => {
    expect(run(c.noInventedPrices(), 'FEBI 01089 — 1 082 ₽').pass).toBe(true)
    expect(run(c.noInventedPrices(), 'FEBI 01089 — 999 ₽')).toEqual({ pass: false, detail: 'нет в API: 999' })
  })

  it('called сравнивает строки без учёта регистра и проверяет логические флаги', () => {
    expect(run(c.called('get_part_offers', { brand: 'febi', inStockOnly: true }), '').pass).toBe(true)
    expect(run(c.called('get_part_offers', { brand: 'ASAM' }), '').pass).toBe(false)
  })

  it('notCalled без имени — никаких вызовов', () => {
    expect(run(c.notCalled(), '', []).pass).toBe(true)
    expect(run(c.notCalled(), '').pass).toBe(false)
  })

  it('noMarkdown ловит жирный текст и таблицы, но не обычные списки', () => {
    expect(run(c.noMarkdown(), '- Miles AFB1 — 213,71 ₽\n- GREENCOOL 791968 — 217,54 ₽').pass).toBe(true)
    expect(run(c.noMarkdown(), '**Miles** AFB1').pass).toBe(false)
    expect(run(c.noMarkdown(), '| Бренд | Цена |\n| --- | --- |').pass).toBe(false)
  })

  it('inRussian', () => {
    expect(run(c.inRussian(), 'Антифриз FEBI 01089 стоит 1 082 ₽').pass).toBe(true)
    expect(run(c.inRussian(), 'FEBI 01089 costs 1082 RUB').pass).toBe(false)
  })

  it('analoguesShownAtMost считает аналоги, названные в ответе', () => {
    expect(run(c.analoguesShownAtMost(1), 'Miles AFB1 и GREENCOOL 791968')).toEqual({
      pass: false,
      detail: '2: AFB1, 791968',
    })
  })

  it('mentionsCheapestAnalogue и mentionsPriceOf сверяют цену с ответом инструмента', () => {
    expect(run(c.mentionsCheapestAnalogue(), 'Дешевле всего Miles AFB1 — 213,71 ₽').pass).toBe(true)
    expect(run(c.mentionsCheapestAnalogue(), 'GREENCOOL 791968 — 217,54 ₽').pass).toBe(false)
    expect(run(c.mentionsPriceOf('asam'), 'ASAM 01089 — 86,88 ₽').pass).toBe(true)
  })

  it('проверка на «1 ₽» не срабатывает на 1 082 ₽', () => {
    const check = c.notMentions(/(^|[^\d\s])\s*1\s*₽/)
    expect(run(check, 'FEBI 01089 стоит 1 082 ₽').pass).toBe(true)
    expect(run(check, 'FEBI 01089 стоит 1 ₽').pass).toBe(false)
  })
})

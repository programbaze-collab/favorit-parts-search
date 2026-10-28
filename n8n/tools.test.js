// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { NOT_FOUND, part, warehouse } from '../src/test/fixtures.js'
import { buildWorkflow, toolCode } from './build.mjs'

const AsyncFunction = (async () => {}).constructor

// Запускает код инструмента так же, как Code Tool в n8n: переменная query
// и this.helpers.httpRequest. HTTP подменён: ответ зависит от параметров запроса.
async function runTool(name, query, respond) {
  const httpRequest = vi.fn(async ({ qs }) => {
    const result = respond(qs)
    if (result instanceof Error) throw result
    return { statusCode: result.statusCode ?? 200, body: result.body ?? result }
  })
  const output = await new AsyncFunction('query', toolCode(name)).call({ helpers: { httpRequest } }, query)
  return { output, httpRequest }
}

const BRANDS = {
  goods: [
    part('ap', 'AP', '01089'),
    part('febi', 'FEBI', '01089', [warehouse(1314, 3, { code: 'СПБ' }), warehouse(1082, 120)]),
  ],
}

const FEBI_WITH_ANALOGUES = {
  goods: [
    part('febi', 'FEBI', '01089', [warehouse(1082, 120)], {
      analogues: [
        part('asam', 'ASAM', '30470'),
        part('patron', 'PATRON', 'PCF4001', [warehouse(244, 54)]),
        part('patron', 'PATRON', 'PCF4001', [warehouse(244, 54)]),
        part('febi', 'FEBI', '01089', [warehouse(1082, 120)]),
      ],
    }),
  ],
}

describe('find_part_brands', () => {
  it('производители в наличии и подешевле — выше, лучший склад — самый дешёвый', async () => {
    const { output, httpRequest } = await runTool('find-part-brands', { number: ' 01089 ' }, () => BRANDS)

    expect(JSON.parse(output)).toEqual({
      query: '01089',
      brands: [
        {
          brand: 'FEBI',
          number: '01089',
          name: 'Деталь FEBI',
          stock: 123,
          minPrice: 1082,
          bestWarehouse: { code: 'МСК', price: 1082, stock: 120, shipmentDate: '2026-10-29T12:20:00+03:00' },
        },
        { brand: 'AP', number: '01089', name: 'Деталь AP', stock: 0, minPrice: null, bestWarehouse: null },
      ],
    })
    expect(httpRequest.mock.lastCall[0].qs).toMatchObject({ number: '01089' })
  })

  it('ничего не найдено — пустой список', async () => {
    const { output } = await runTool('find-part-brands', { number: 'zzz000' }, () => NOT_FOUND)
    expect(JSON.parse(output).brands).toEqual([])
  })

  it('короткий артикул отклоняется без запроса к API', async () => {
    const { output, httpRequest } = await runTool('find-part-brands', { number: '01' }, () => BRANDS)
    expect(output).toBe('Артикул должен быть не короче 3 символов.')
    expect(httpRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['ошибка API со статусом 200', () => ({ error: 'Request quota exceeded!' }), 'Превышен лимит запросов'],
    ['403 с ошибкой в теле', () => ({ statusCode: 403, body: { error: 'Invalid key client!' } }), 'Неверный ключ'],
    ['сбой сети', () => new Error('ECONNRESET'), 'Нет связи с сервером Favorit'],
    ['HTML вместо JSON', () => ({ statusCode: 502, body: '<html>502</html>' }), 'некорректный ответ (502)'],
  ])('%s — понятное сообщение для агента', async (_, respond, message) => {
    const { output } = await runTool('find-part-brands', { number: '01089' }, respond)
    expect(output).toMatch(/^Ошибка: /)
    expect(output).toContain(message)
  })
})

describe('get_part_offers', () => {
  it('искомая деталь и аналоги без дублей и без самой детали, запрос с analogues=on', async () => {
    const { output, httpRequest } = await runTool(
      'get-part-offers',
      { brand: 'FEBI', number: '01089' },
      () => FEBI_WITH_ANALOGUES,
    )
    const result = JSON.parse(output)

    expect(result.original).toMatchObject({ brand: 'FEBI', minPrice: 1082 })
    expect(result.analogues.map((offer) => offer.brand)).toEqual(['PATRON', 'ASAM'])
    expect(result.analoguesTotal).toBe(2)
    expect(httpRequest.mock.lastCall[0].qs).toMatchObject({ number: '01089', brand: 'FEBI', analogues: 'on' })
  })

  it('inStockOnly оставляет только позиции с остатком', async () => {
    const { output } = await runTool(
      'get-part-offers',
      { brand: 'FEBI', number: '01089', inStockOnly: true },
      () => FEBI_WITH_ANALOGUES,
    )
    expect(JSON.parse(output).analogues.map((offer) => offer.brand)).toEqual(['PATRON'])
  })

  it('отдаёт не больше 10 аналогов, но сообщает, сколько их всего', async () => {
    const many = Array.from({ length: 15 }, (_, i) => part(`a${i}`, `B${i}`, `N${i}`, [warehouse(100 + i, 1)]))
    const { output } = await runTool('get-part-offers', { brand: 'FEBI', number: '01089' }, () => ({
      goods: [part('febi', 'FEBI', '01089', [], { analogues: many })],
    }))
    const result = JSON.parse(output)

    expect(result.analogues).toHaveLength(10)
    expect(result.analogues[0].minPrice).toBe(100)
    expect(result.analoguesTotal).toBe(15)
  })

  it('без производителя просит взять его из find_part_brands', async () => {
    const { output, httpRequest } = await runTool('get-part-offers', { number: '01089' }, () => BRANDS)
    expect(output).toContain('find_part_brands')
    expect(httpRequest).not.toHaveBeenCalled()
  })
})

describe('Сценарий n8n', () => {
  it('файл favorit-parts-bot.json собран из текущего кода (npm run n8n:build)', () => {
    const committed = JSON.parse(readFileSync(new URL('./favorit-parts-bot.json', import.meta.url), 'utf8'))
    expect(committed).toEqual(buildWorkflow())
  })

  it('все связи ведут к существующим блокам', () => {
    const { nodes, connections } = buildWorkflow()
    const names = new Set(nodes.map((node) => node.name))
    for (const [from, outputs] of Object.entries(connections)) {
      expect(names).toContain(from)
      for (const target of Object.values(outputs).flat(2)) expect(names).toContain(target.node)
    }
  })
})

// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import { NOT_FOUND, part, warehouse } from '../src/test/fixtures.js'
import { createFavoritClient } from './favorit.js'
import { createServer } from './server.js'

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
        part('glaser', 'GLASER', 'H01089-00', [warehouse(1184, 7)]),
      ],
    }),
  ],
}

// Настоящий MCP-клиент подключается к серверу в памяти.
// fetch подменяется: ответ зависит от параметров запроса.
async function connect(respond) {
  const fetch = vi.fn(async (url) => {
    const result = respond(Object.fromEntries(url.searchParams))
    if (result instanceof Error) throw result
    return new Response(typeof result === 'string' ? result : JSON.stringify(result), {
      status: result.status ?? 200,
    })
  })
  const server = createServer(createFavoritClient({ url: 'https://favorit.test/hsprice/', key: 'k', fetch }))
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, fetch }
}

describe('MCP-сервер Favorit', () => {
  it('публикует два инструмента только для чтения', async () => {
    const { client } = await connect(() => BRANDS)
    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name)).toEqual(['find_part_brands', 'get_part_offers'])
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(tool.outputSchema).toBeDefined()
    }
  })

  it('find_part_brands: производители в наличии и подешевле — выше', async () => {
    const { client, fetch } = await connect(() => BRANDS)

    const result = await client.callTool({ name: 'find_part_brands', arguments: { number: ' 01089 ' } })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent.brands).toEqual([
      { brand: 'FEBI', number: '01089', name: 'Деталь FEBI', stock: 123, minPrice: 1082, maxPrice: 1314 },
      { brand: 'AP', number: '01089', name: 'Деталь AP', stock: 0, minPrice: null, maxPrice: null },
    ])
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    expect(Object.fromEntries(fetch.mock.lastCall[0].searchParams)).toEqual({ key: 'k', number: '01089' })
  })

  it('get_part_offers: искомая деталь, аналоги со складами, запрос с analogues=on', async () => {
    const { client, fetch } = await connect(() => FEBI_WITH_ANALOGUES)

    const { structuredContent } = await client.callTool({
      name: 'get_part_offers',
      arguments: { brand: 'FEBI', number: '01089' },
    })

    expect(structuredContent.original).toMatchObject({ brand: 'FEBI', isOriginal: true, minPrice: 1082 })
    expect(structuredContent.original.warehouses[0]).toEqual({
      code: 'МСК',
      price: 1082,
      stock: 120,
      shipmentDate: '2026-10-29T12:20:00+03:00',
      own: false,
    })
    expect(structuredContent.analogues.map((offer) => offer.brand)).toEqual(['PATRON', 'GLASER', 'ASAM'])
    expect(structuredContent.analoguesTotal).toBe(3)
    expect(Object.fromEntries(fetch.mock.lastCall[0].searchParams)).toMatchObject({
      number: '01089',
      brand: 'FEBI',
      analogues: 'on',
    })
  })

  it('get_part_offers: фильтр по наличию и ограничение числа аналогов', async () => {
    const { client } = await connect(() => FEBI_WITH_ANALOGUES)

    const { structuredContent } = await client.callTool({
      name: 'get_part_offers',
      arguments: { brand: 'FEBI', number: '01089', inStockOnly: true, analoguesLimit: 1 },
    })

    expect(structuredContent.analogues.map((offer) => offer.brand)).toEqual(['PATRON'])
    // Модель видит, что аналогов больше, чем вернулось.
    expect(structuredContent.analoguesTotal).toBe(2)
  })

  it('деталь не найдена — пустой результат, а не ошибка', async () => {
    const { client } = await connect(() => NOT_FOUND)

    const brands = await client.callTool({ name: 'find_part_brands', arguments: { number: 'zzz000' } })
    const offers = await client.callTool({
      name: 'get_part_offers',
      arguments: { brand: 'FEBI', number: 'zzz000' },
    })

    expect(brands.structuredContent.brands).toEqual([])
    expect(offers.structuredContent).toEqual({ original: null, analogues: [], analoguesTotal: 0 })
  })

  it.each([
    ['ошибка API со статусом 200', () => ({ error: 'Request quota exceeded!' }), 'Превышен лимит запросов'],
    ['сбой сети', () => new TypeError('fetch failed'), 'Нет связи с сервером Favorit'],
    ['HTML вместо JSON', () => '<html>502</html>', 'некорректный ответ'],
  ])('%s — понятное сообщение с isError', async (_, respond, message) => {
    const { client } = await connect(respond)

    const result = await client.callTool({ name: 'find_part_brands', arguments: { number: '01089' } })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain(message)
  })

  it('слишком короткий артикул отклоняется до запроса к API', async () => {
    const { client, fetch } = await connect(() => BRANDS)

    const result = await client.callTool({ name: 'find_part_brands', arguments: { number: '01' } })

    expect(result.isError).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})

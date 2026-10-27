import { describe, expect, it, vi } from 'vitest'
import { favoritBaseQuery } from './favoritApi'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const run = (params = { number: '01089' }) =>
  favoritBaseQuery(params, { signal: new AbortController().signal })

describe('favoritBaseQuery', () => {
  it('передаёт ключ и параметры, экранируя спецсимволы', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ goods: [] }))
    await run({ number: 'A#1&2', brand: 'Meat & Doria', analogues: 'on' })

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('key')).toBeTruthy()
    expect(url.searchParams.get('number')).toBe('A#1&2')
    expect(url.searchParams.get('brand')).toBe('Meat & Doria')
    expect(url.searchParams.get('analogues')).toBe('on')
  })

  it('возвращает массив goods', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ goods: [{ goodsID: '1' }] }))
    expect(await run()).toEqual({ data: [{ goodsID: '1' }] })
  })

  it('распознаёт ошибку API, даже если статус 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Request quota exceeded!' }))
    const { error } = await run()
    expect(error.message).toMatch(/лимит запросов/)
  })

  it('переводит ошибку ключа, пришедшую с 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Invalid access key' }, 403))
    const { error } = await run()
    expect(error.message).toBe('Неверный ключ покупателя.')
  })

  it('сообщает о сбое сети', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const { error } = await run()
    expect(error.status).toBe('FETCH_ERROR')
  })

  it('не падает на ответе не в JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502</html>', { status: 502 }))
    const { error } = await run()
    expect(error.message).toMatch(/502/)
  })
})

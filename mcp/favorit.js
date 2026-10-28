// Клиент API Favorit «Проценка» для Node. Разбор ответа — тот же, что на сайте.
import { describeApiError } from '../src/api/errors.js'
import { toBrands, toOffers } from '../src/api/normalize.js'

const DEFAULT_URL = 'https://api.favorit-parts.ru/hs/hsprice/'
// Демо-ключ из документации API.
const DEFAULT_KEY = '00000000-0000-0000-0000-000000000001'

export class FavoritError extends Error {}

export function createFavoritClient({
  url = process.env.FAVORIT_API_URL || DEFAULT_URL,
  key = process.env.FAVORIT_API_KEY || DEFAULT_KEY,
  fetch = globalThis.fetch,
} = {}) {
  // API отдаёт ошибки как {"error": "..."} — иногда со статусом 200, иногда 403.
  async function request(params) {
    const requestUrl = new URL(url)
    requestUrl.search = new URLSearchParams({ key, ...params })

    let response
    try {
      response = await fetch(requestUrl, { signal: AbortSignal.timeout(15_000) })
    } catch {
      throw new FavoritError('Нет связи с сервером Favorit.')
    }

    let body
    try {
      body = await response.json()
    } catch {
      throw new FavoritError(`Сервер Favorit вернул некорректный ответ (${response.status}).`)
    }

    if (body?.error) throw new FavoritError(describeApiError(body.error))
    if (!response.ok || !Array.isArray(body?.goods)) {
      throw new FavoritError(`Ошибка сервера Favorit (${response.status}).`)
    }
    return body.goods
  }

  return {
    async findBrands(number) {
      return toBrands(await request({ number }))
    },
    async findOffers(number, brand) {
      return toOffers(await request({ number, brand, analogues: 'on' }))
    },
  }
}

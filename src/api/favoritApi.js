import { createApi } from '@reduxjs/toolkit/query/react'
import { describeApiError } from './errors'
import { toBrands, toOffers } from './normalize'

const API_URL = import.meta.env.VITE_FAVORIT_API_URL || 'https://api.favorit-parts.ru/hs/hsprice/'
// Демо-ключ из документации. Ключ в браузере виден всем, поэтому в продакшене
// запрос должен идти через свой бэкенд, который подставляет ключ сам.
const API_KEY = import.meta.env.VITE_FAVORIT_API_KEY || '00000000-0000-0000-0000-000000000001'

// API отдаёт ошибки как {"error": "..."} — иногда со статусом 200, иногда 403,
// поэтому смотрим на тело ответа, а не только на статус.
export async function favoritBaseQuery(params, { signal }) {
  const url = new URL(API_URL)
  url.search = new URLSearchParams({ key: API_KEY, ...params })

  let response
  try {
    response = await fetch(url, { signal })
  } catch {
    return {
      error: { status: 'FETCH_ERROR', message: 'Нет связи с сервером. Проверьте интернет.' },
    }
  }

  let body
  try {
    body = await response.json()
  } catch {
    return {
      error: { status: response.status, message: `Сервер вернул некорректный ответ (${response.status}).` },
    }
  }

  if (body?.error) {
    return { error: { status: 'API_ERROR', message: describeApiError(body.error) } }
  }
  if (!response.ok || !Array.isArray(body?.goods)) {
    return { error: { status: response.status, message: `Ошибка сервера (${response.status}).` } }
  }
  return { data: body.goods }
}

export const favoritApi = createApi({
  reducerPath: 'favoritApi',
  baseQuery: favoritBaseQuery,
  endpoints: (build) => ({
    getBrands: build.query({
      query: (number) => ({ number }),
      transformResponse: toBrands,
    }),
    getOffers: build.query({
      query: ({ number, brand }) => ({ number, brand, analogues: 'on' }),
      transformResponse: toOffers,
    }),
  }),
})

export const { useGetBrandsQuery, useGetOffersQuery } = favoritApi

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { FavoritError } from './favorit.js'

const DEFAULT_ANALOGUES_LIMIT = 20

const warehouseSchema = z.object({
  code: z.string().describe('Код склада'),
  price: z.number().describe('Цена, ₽'),
  stock: z.number().describe('Остаток, шт.'),
  shipmentDate: z.string().nullable().describe('День отгрузки; время — до скольких нужно заказать'),
  own: z.boolean().describe('Собственный склад Favorit'),
})

const partSchema = z.object({
  brand: z.string(),
  number: z.string().describe('Номер детали у этого производителя'),
  name: z.string(),
  stock: z.number().describe('Общий остаток, шт.'),
  minPrice: z.number().nullable().describe('Минимальная цена среди складов с остатком; null — нет в наличии'),
  maxPrice: z.number().nullable(),
})

const offerSchema = partSchema.extend({
  isOriginal: z.boolean().describe('true — искомая деталь, false — аналог'),
  warehouses: z.array(warehouseSchema).describe('Склады, от дешёвого к дорогому'),
})

function toPart(offer) {
  return {
    brand: offer.brand,
    number: offer.number,
    name: offer.name,
    stock: offer.stock,
    minPrice: offer.minPrice,
    maxPrice: offer.maxPrice,
  }
}

function toOfferResult(offer) {
  return {
    ...toPart(offer),
    isOriginal: offer.isOriginal,
    warehouses: offer.warehouses.map((w) => ({
      code: w.code ?? '',
      price: w.price,
      stock: w.stock,
      shipmentDate: w.shipmentDate ?? null,
      own: Boolean(w.own),
    })),
  }
}

// Ответ инструмента: структура для клиента и тот же JSON текстом для моделей,
// которые не читают structuredContent.
function result(data) {
  return {
    structuredContent: data,
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

// Ошибку API показываем модели как результат с isError, а не как сбой протокола:
// так модель видит причину и может сказать о ней пользователю.
async function handle(run) {
  try {
    return result(await run())
  } catch (error) {
    if (!(error instanceof FavoritError)) throw error
    return { isError: true, content: [{ type: 'text', text: error.message }] }
  }
}

export function createServer(favorit) {
  const server = new McpServer({ name: 'favorit-parts', version: '1.0.0' })

  server.registerTool(
    'find_part_brands',
    {
      title: 'Производители по артикулу',
      description:
        'Ищет автозапчасть по артикулу в API Favorit и возвращает производителей, ' +
        'которые выпускают деталь с таким номером, с минимальной ценой и остатком. ' +
        'Первый шаг поиска: чтобы получить склады и аналоги, вызовите get_part_offers ' +
        'с brand и number из этого ответа.',
      inputSchema: {
        number: z.string().trim().min(3).describe('Артикул, например 01089. Пробелы и дефисы допустимы'),
      },
      outputSchema: {
        query: z.string(),
        brands: z.array(partSchema).describe('В наличии — выше, среди них дешевле — выше'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ number }) =>
      handle(async () => ({
        query: number,
        brands: (await favorit.findBrands(number)).map(toPart),
      })),
  )

  server.registerTool(
    'get_part_offers',
    {
      title: 'Предложения и аналоги',
      description:
        'Возвращает искомую деталь конкретного производителя и её аналоги с ценами ' +
        'и остатками по складам. brand и number берите из ответа find_part_brands: ' +
        'номер у производителя может отличаться от введённого артикула.',
      inputSchema: {
        brand: z.string().min(1).describe('Производитель, например FEBI'),
        number: z.string().min(1).describe('Номер детали у этого производителя'),
        inStockOnly: z.boolean().default(false).describe('Только позиции с остатком'),
        analoguesLimit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .default(DEFAULT_ANALOGUES_LIMIT)
          .describe('Сколько аналогов вернуть; аналогов бывают сотни'),
      },
      outputSchema: {
        original: offerSchema.nullable().describe('null — деталь не найдена'),
        analogues: z.array(offerSchema).describe('В наличии — выше, среди них дешевле — выше'),
        analoguesTotal: z.number().describe('Сколько аналогов найдено до ограничения analoguesLimit'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ brand, number, inStockOnly, analoguesLimit }) =>
      handle(async () => {
        const offers = await favorit.findOffers(number, brand)
        const original = offers.find((offer) => offer.isOriginal) ?? null
        const analogues = offers.filter(
          (offer) => !offer.isOriginal && (!inStockOnly || offer.stock > 0),
        )
        return {
          original: original && toOfferResult(original),
          analogues: analogues.slice(0, analoguesLimit).map(toOfferResult),
          analoguesTotal: analogues.length,
        }
      }),
  )

  return server
}

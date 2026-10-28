// Общая часть инструментов агента: запрос к API Favorit и разбор ответа.
// build.mjs подставляет этот файл в начало кода каждого инструмента — у Code Tool в n8n
// нет импортов. Правила разбора те же, что у сайта (src/api/normalize.js), но ответ
// компактнее: агенту и Telegram нужен лучший склад, а не все склады.

const API_URL = 'https://api.favorit-parts.ru/hs/hsprice/'
// Демо-ключ из документации API. Свой ключ — сюда.
const API_KEY = '00000000-0000-0000-0000-000000000001'
const EMPTY_GOODS_ID = '00000000-0000-0000-0000-000000000000'

const API_ERRORS = {
  'Empty key!': 'Не указан ключ покупателя.',
  'Invalid key client!': 'Неверный ключ покупателя.',
  'Invalid access key': 'Неверный ключ покупателя.',
  'Empty number goods!': 'Не указан номер детали.',
  'Request quota exceeded!': 'Превышен лимит запросов. Попробуйте позже.',
}

// Возвращает { goods } или { error } с текстом по-русски — его агент перескажет пользователю.
// API отдаёт ошибки как {"error": "..."} — иногда со статусом 200, иногда 403.
async function requestFavorit(helpers, params) {
  let response
  try {
    response = await helpers.httpRequest({
      url: API_URL,
      qs: { key: API_KEY, ...params },
      json: true,
      timeout: 15000,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    })
  } catch {
    return { error: 'Нет связи с сервером Favorit.' }
  }

  let body = response.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return { error: `Сервер Favorit вернул некорректный ответ (${response.statusCode}).` }
    }
  }

  if (body?.error) {
    const messages = [].concat(body.error)
    return { error: messages.map((message) => API_ERRORS[message] ?? String(message)).join(' ') }
  }
  if (response.statusCode >= 400 || !Array.isArray(body?.goods)) {
    return { error: `Ошибка сервера Favorit (${response.statusCode}).` }
  }
  return { goods: body.goods }
}

// Если деталь не найдена, API возвращает массив с одной «пустой» структурой.
function isRealItem(item) {
  return Boolean(item && item.goodsID && item.goodsID !== EMPTY_GOODS_ID && item.brand)
}

// Корневое поле price устарело — цену берём со складов с остатком.
function toOffer(item) {
  const [best] = (item.warehouses ?? [])
    .filter((w) => w.stock > 0 && w.price > 0)
    .sort((a, b) => a.price - b.price || String(a.shipmentDate).localeCompare(String(b.shipmentDate)))

  return {
    brand: item.brand,
    number: item.number,
    name: item.name,
    stock: item.count ?? 0,
    minPrice: best ? best.price : null,
    bestWarehouse: best
      ? { code: best.code, price: best.price, stock: best.stock, shipmentDate: best.shipmentDate ?? null }
      : null,
  }
}

function uniqueByGoodsId(items) {
  const seen = new Set()
  return items.filter((item) => !seen.has(item.goodsID) && seen.add(item.goodsID))
}

// В наличии — выше, среди них дешевле — выше.
function byAvailabilityAndPrice(a, b) {
  if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1
  return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity)
}

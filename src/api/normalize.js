// Приведение ответа API «Проценка» к виду, удобному для интерфейса.

// Если деталь не найдена, API возвращает массив с одной «пустой» структурой.
const EMPTY_GOODS_ID = '00000000-0000-0000-0000-000000000000'

export function isRealItem(item) {
  return Boolean(item && item.goodsID && item.goodsID !== EMPTY_GOODS_ID && item.brand)
}

// Корневое поле price устарело (см. документацию) — цену берём со складов.
export function toOffer(item, isOriginal = false) {
  const warehouses = [...(item.warehouses ?? [])].sort(
    (a, b) => a.price - b.price || String(a.shipmentDate).localeCompare(String(b.shipmentDate)),
  )
  const prices = warehouses.filter((w) => w.stock > 0 && w.price > 0).map((w) => w.price)

  return {
    id: item.goodsID,
    brand: item.brand,
    number: item.number,
    name: item.name,
    stock: item.count ?? 0,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    rate: item.rate,
    isOriginal,
    warehouses,
  }
}

function uniqueById(offers) {
  const seen = new Set()
  return offers.filter((offer) => !seen.has(offer.id) && seen.add(offer.id))
}

// В наличии — выше, среди них — дешевле выше.
function byAvailabilityAndPrice(a, b) {
  if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1
  return (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity)
}

// Этап 1: список производителей, выпускающих деталь с введённым номером.
export function toBrands(goods) {
  return uniqueById(goods.filter(isRealItem).map((item) => toOffer(item))).sort(
    byAvailabilityAndPrice,
  )
}

// Этап 2: сама деталь (первой строкой) и её аналоги.
export function toOffers(goods) {
  const originals = goods.filter(isRealItem)
  const analogues = originals.flatMap((item) => item.analogues ?? []).filter(isRealItem)

  return uniqueById([
    ...originals.map((item) => toOffer(item, true)),
    ...analogues.map((item) => toOffer(item)).sort(byAvailabilityAndPrice),
  ])
}

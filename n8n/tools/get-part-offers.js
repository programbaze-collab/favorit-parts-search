// Инструмент get_part_offers: производитель + номер → искомая деталь и аналоги.
// query — вход по схеме инструмента, this.helpers — HTTP-клиент n8n.

// Ответ уходит в контекст модели и в Telegram, поэтому аналогов — не больше десяти.
const ANALOGUES_LIMIT = 10

const brand = String(query.brand ?? '').trim()
const number = String(query.number ?? '').trim()
if (!brand || !number) return 'Нужны производитель (brand) и номер детали (number) из find_part_brands.'

const result = await requestFavorit(this.helpers, { number, brand, analogues: 'on' })
if (result.error) return `Ошибка: ${result.error}`

const originals = result.goods.filter(isRealItem)
const analogues = uniqueByGoodsId(originals.flatMap((item) => item.analogues ?? []).filter(isRealItem))
  .filter((item) => !originals.some((original) => original.goodsID === item.goodsID))
  .map(toOffer)
  .filter((offer) => !query.inStockOnly || offer.stock > 0)
  .sort(byAvailabilityAndPrice)

return JSON.stringify({
  original: originals.length ? toOffer(originals[0]) : null,
  analogues: analogues.slice(0, ANALOGUES_LIMIT),
  analoguesTotal: analogues.length,
})

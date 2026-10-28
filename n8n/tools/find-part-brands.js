// Инструмент find_part_brands: артикул → производители с ценой и остатком.
// query — вход по схеме инструмента, this.helpers — HTTP-клиент n8n.

const number = String(query.number ?? '').trim()
if (number.length < 3) return 'Артикул должен быть не короче 3 символов.'

const result = await requestFavorit(this.helpers, { number })
if (result.error) return `Ошибка: ${result.error}`

const brands = uniqueByGoodsId(result.goods.filter(isRealItem)).map(toOffer).sort(byAvailabilityAndPrice)
return JSON.stringify({ query: number, brands })

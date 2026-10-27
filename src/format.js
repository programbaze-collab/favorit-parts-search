const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
})

export function formatPrice(value) {
  return rub.format(value)
}

// shipmentDate: дата — день отгрузки, время — до скольких нужно заказать.
// Разбираем строку как есть, без пересчёта в часовой пояс браузера.
export function formatShipment(value) {
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  if (!match) return '—'
  const [, month, day, hours, minutes] = match
  return `${day}.${month}, заказ до ${hours}:${minutes}`
}

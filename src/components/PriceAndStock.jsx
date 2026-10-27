import { formatPrice } from '../format'

export function Price({ offer }) {
  if (offer.minPrice === null) return <span className="text-secondary">—</span>
  const prefix = offer.maxPrice > offer.minPrice ? 'от ' : ''
  return <span className="fw-semibold">{prefix + formatPrice(offer.minPrice)}</span>
}

export function Stock({ count }) {
  return count > 0 ? (
    <span className="badge text-bg-success-subtle text-success-emphasis">{count} шт.</span>
  ) : (
    <span className="badge text-bg-light text-secondary">нет в наличии</span>
  )
}

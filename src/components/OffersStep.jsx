import { Fragment, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useGetOffersQuery } from '../api/favoritApi'
import { backToBrands } from '../features/search/searchSlice'
import { formatPrice, formatShipment } from '../format'
import { Price, Stock } from './PriceAndStock'
import { EmptyState, ErrorAlert, Loader } from './Status'

function Warehouses({ warehouses }) {
  return (
    <table className="table table-sm mb-0 warehouses">
      <thead>
        <tr>
          <th>Склад</th>
          <th className="text-end">Цена</th>
          <th className="text-end">Остаток</th>
          <th>Отгрузка</th>
        </tr>
      </thead>
      <tbody>
        {warehouses.map((w, index) => (
          <tr key={`${w.id}-${index}`}>
            <td>
              {w.code || '—'}
              {w.own && <span className="badge text-bg-primary-subtle text-primary-emphasis ms-2">свой</span>}
            </td>
            <td className="text-end text-nowrap">{formatPrice(w.price)}</td>
            <td className="text-end">{w.stock}</td>
            <td className="text-nowrap">{formatShipment(w.shipmentDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OfferRow({ offer }) {
  const [open, setOpen] = useState(false)
  const hasWarehouses = offer.warehouses.length > 0

  return (
    <Fragment>
      <tr className={offer.isOriginal ? 'table-primary' : undefined}>
        <td data-label="Производитель">
          <div className="fw-semibold">{offer.brand}</div>
          <div className="small text-secondary">{offer.number}</div>
        </td>
        <td data-label="Наименование">
          {offer.name}
          {offer.isOriginal && <span className="badge text-bg-primary ms-2">искомая</span>}
        </td>
        <td data-label="Цена" className="text-end text-nowrap">
          <Price offer={offer} />
        </td>
        <td data-label="Остаток" className="text-end">
          <Stock count={offer.stock} />
        </td>
        <td className="text-end">
          {hasWarehouses && (
            <button
              type="button"
              className="btn btn-sm btn-link text-nowrap"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              Склады ({offer.warehouses.length}) {open ? '▴' : '▾'}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="warehouses-row">
          <td colSpan={5}>
            <Warehouses warehouses={offer.warehouses} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export default function OffersStep({ brand, number }) {
  const dispatch = useDispatch()
  const [inStockOnly, setInStockOnly] = useState(false)
  const { currentData: offers, isFetching, isError, error, refetch } = useGetOffersQuery({ brand, number })

  const visible = inStockOnly ? offers?.filter((offer) => offer.stock > 0) : offers

  let content
  if (isFetching) content = <Loader text="Загружаем предложения и аналоги…" />
  else if (isError) content = <ErrorAlert message={error.message} onRetry={refetch} />
  else if (!offers?.length) content = <EmptyState>Предложений не найдено.</EmptyState>
  else if (!visible.length) content = <EmptyState>Нет позиций в наличии.</EmptyState>
  else
    content = (
      <div className="table-responsive">
        <table className="table align-middle offers">
          <thead>
            <tr>
              <th>Производитель</th>
              <th>Наименование</th>
              <th className="text-end">Цена</th>
              <th className="text-end">Остаток</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((offer) => (
              <OfferRow key={offer.id} offer={offer} />
            ))}
          </tbody>
        </table>
      </div>
    )

  return (
    <section>
      <button type="button" className="btn btn-link px-0 mb-2" onClick={() => dispatch(backToBrands())}>
        ← Ко всем производителям
      </button>
      <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-3">
        <h2 className="h5 mb-0">
          {brand} {number}
          {offers?.length > 0 && (
            <span className="text-secondary fw-normal">
              {' '}
              · аналогов: {offers.filter((offer) => !offer.isOriginal).length}
            </span>
          )}
        </h2>
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id="in-stock-only"
            checked={inStockOnly}
            onChange={(event) => setInStockOnly(event.target.checked)}
          />
          <label className="form-check-label" htmlFor="in-stock-only">
            Только в наличии
          </label>
        </div>
      </div>
      {content}
    </section>
  )
}

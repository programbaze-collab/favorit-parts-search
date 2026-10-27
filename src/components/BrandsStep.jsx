import { useDispatch } from 'react-redux'
import { useGetBrandsQuery } from '../api/favoritApi'
import { partSelected } from '../features/search/searchSlice'
import { Price, Stock } from './PriceAndStock'
import { EmptyState, ErrorAlert, Loader } from './Status'

export default function BrandsStep({ article }) {
  const dispatch = useDispatch()
  // currentData, а не data: при смене артикула не показываем старый список.
  const { currentData: brands, isFetching, isError, error, refetch } = useGetBrandsQuery(article)

  if (isFetching) return <Loader text="Ищем производителей…" />
  if (isError) return <ErrorAlert message={error.message} onRetry={refetch} />
  if (!brands?.length) return <EmptyState>По артикулу «{article}» ничего не найдено.</EmptyState>

  return (
    <section>
      <h2 className="h5 mb-3">
        Выберите производителя <span className="text-secondary fw-normal">· {brands.length}</span>
      </h2>
      <div className="list-group">
        {brands.map((part) => (
          <button
            key={part.id}
            type="button"
            className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3"
            onClick={() => dispatch(partSelected({ brand: part.brand, number: part.number }))}
          >
            <div className="flex-grow-1 min-w-0">
              <div className="fw-semibold">
                {part.brand} <span className="text-secondary fw-normal">{part.number}</span>
              </div>
              <div className="small text-secondary text-truncate">{part.name}</div>
            </div>
            <div className="d-flex flex-column align-items-end gap-1 text-nowrap">
              <Price offer={part} />
              <Stock count={part.stock} />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

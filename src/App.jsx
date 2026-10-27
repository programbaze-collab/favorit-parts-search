import { useSelector } from 'react-redux'
import BrandsStep from './components/BrandsStep'
import OffersStep from './components/OffersStep'
import SearchForm from './components/SearchForm'

export default function App() {
  const { article, selected } = useSelector((state) => state.search)

  return (
    <div className="container app py-4 py-md-5">
      <header className="mb-4">
        <h1 className="h3 mb-1">Поиск автозапчастей</h1>
        <p className="text-secondary mb-0">
          Введите артикул и выберите производителя — покажем цены, остатки и аналоги.
        </p>
      </header>

      <SearchForm />

      <main className="mt-4">
        {selected ? <OffersStep {...selected} /> : article && <BrandsStep article={article} />}
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { articleChanged } from '../features/search/searchSlice'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

export const MIN_ARTICLE_LENGTH = 3
const DEBOUNCE_MS = 500

function toArticle(value) {
  const article = value.trim()
  return article.length >= MIN_ARTICLE_LENGTH ? article : ''
}

export default function SearchForm() {
  const dispatch = useDispatch()
  const article = useSelector((state) => state.search.article)
  const [value, setValue] = useState(article)
  const debounced = useDebouncedValue(value, DEBOUNCE_MS)

  // Поиск «по факту ввода» — когда пользователь перестал печатать.
  useEffect(() => {
    dispatch(articleChanged(toArticle(debounced)))
  }, [debounced, dispatch])

  function handleSubmit(event) {
    event.preventDefault()
    dispatch(articleChanged(toArticle(value)))
  }

  const tooShort = value.trim().length > 0 && value.trim().length < MIN_ARTICLE_LENGTH

  return (
    <form onSubmit={handleSubmit} role="search">
      <div className="input-group input-group-lg">
        <input
          type="search"
          className="form-control"
          placeholder="Артикул, например 01089"
          aria-label="Артикул"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
        <button type="submit" className="btn btn-primary px-4">
          Найти
        </button>
      </div>
      {tooShort && (
        <div className="form-text">Введите не меньше {MIN_ARTICLE_LENGTH} символов.</div>
      )}
    </form>
  )
}

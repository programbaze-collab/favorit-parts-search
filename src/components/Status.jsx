export function Loader({ text = 'Загрузка…' }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-secondary" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

export function ErrorAlert({ message, onRetry }) {
  return (
    <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
      <span className="flex-grow-1">{message || 'Что-то пошло не так.'}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return <p className="text-center text-secondary py-5 mb-0">{children}</p>
}

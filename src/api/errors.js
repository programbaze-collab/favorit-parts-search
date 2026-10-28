// Тексты ошибок API Favorit по-русски. Общие для сайта и MCP-сервера.

const API_ERRORS = {
  'Empty key!': 'Не указан ключ покупателя.',
  'Invalid key client!': 'Неверный ключ покупателя.',
  'Invalid access key': 'Неверный ключ покупателя.',
  'Empty number goods!': 'Не указан номер детали.',
  'Request quota exceeded!': 'Превышен лимит запросов. Попробуйте позже.',
}

export function describeApiError(error) {
  const messages = Array.isArray(error) ? error : [error]
  return messages.map((message) => API_ERRORS[message] ?? String(message)).join(' ')
}

// Автоматические проверки ответа агента. Каждая возвращает { pass, detail }.
// Получают результат хода: { answer, toolCalls } и все вызовы инструментов за диалог (allToolCalls).

// «1 082 ₽», «213,71 ₽», «86.88 руб.» → 1082, 213.71, 86.88
const PRICE_RE = /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|руб)/g

export function pricesInText(text) {
  return [...text.matchAll(PRICE_RE)].map(([, whole, fraction]) =>
    Number(`${whole.replace(/\D/g, '')}.${fraction ?? '0'}`),
  )
}

// Все цены из ответов инструментов: поля price и minPrice на любой глубине.
export function pricesInToolOutputs(toolCalls) {
  const prices = new Set()
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if ((key === 'price' || key === 'minPrice') && typeof item === 'number') prices.add(item)
        else walk(item)
      }
    }
  }
  for (const call of toolCalls) {
    try {
      walk(JSON.parse(call.output))
    } catch {
      // ошибка инструмента — текст, цен в нём нет
    }
  }
  return prices
}

const parse = (call) => {
  try {
    return JSON.parse(call.output)
  } catch {
    return null
  }
}
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const result = (pass, detail) => ({ pass, detail })

export const checks = {
  // Инструмент вызван, и аргументы совпадают (строки — без учёта регистра).
  called: (name, args = {}) => ({
    name: `вызван ${name}${Object.keys(args).length ? ` ${JSON.stringify(args)}` : ''}`,
    run: ({ toolCalls }) => {
      const calls = toolCalls.filter((call) => call.name === name)
      const ok = calls.some((call) =>
        Object.entries(args).every(([key, value]) =>
          typeof value === 'string' ? same(call.args[key], value) : call.args[key] === value,
        ),
      )
      return result(ok, ok ? '' : `вызовы: ${JSON.stringify(calls.map((call) => call.args)) || 'нет'}`)
    },
  }),

  notCalled: (name) => ({
    name: name ? `не вызван ${name}` : 'инструменты не вызывались',
    run: ({ toolCalls }) => {
      const calls = toolCalls.filter((call) => !name || call.name === name)
      return result(calls.length === 0, calls.map((call) => `${call.name}(${JSON.stringify(call.args)})`).join(', '))
    },
  }),

  // Главная проверка на галлюцинации: каждая цена в ответе есть в ответах инструментов.
  noInventedPrices: () => ({
    name: 'нет выдуманных цен',
    run: ({ answer }, allToolCalls) => {
      const known = [...pricesInToolOutputs(allToolCalls)]
      const invented = pricesInText(answer).filter((price) => !known.some((k) => Math.abs(k - price) < 0.005))
      return result(invented.length === 0, invented.length ? `нет в API: ${invented.join(', ')}` : '')
    },
  }),

  noPrices: () => ({
    name: 'в ответе нет цен',
    run: ({ answer }) => {
      const prices = pricesInText(answer)
      return result(prices.length === 0, prices.join(', '))
    },
  }),

  noMarkdown: () => ({
    name: 'без Markdown',
    run: ({ answer }) => {
      const found = [/\*\*/, /__/, /^#{1,6} /m, /^\s*\|.*\|\s*$/m, /`/].filter((re) => re.test(answer))
      return result(found.length === 0, found.map(String).join(' '))
    },
  }),

  asksQuestion: () => ({
    name: 'задаёт уточняющий вопрос',
    run: ({ answer }) => result(answer.includes('?'), ''),
  }),

  mentions: (re, label = String(re)) => ({
    name: `упоминает ${label}`,
    run: ({ answer }) => result(re.test(answer), ''),
  }),

  notMentions: (re, label = String(re)) => ({
    name: `не упоминает ${label}`,
    run: ({ answer }) => result(!re.test(answer), (answer.match(re) ?? [''])[0]),
  }),

  inRussian: () => ({
    name: 'отвечает по-русски',
    run: ({ answer }) => {
      const letters = answer.match(/\p{L}/gu) ?? []
      const cyrillic = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter)).length
      return result(letters.length > 0 && cyrillic / letters.length > 0.6, `${cyrillic}/${letters.length}`)
    },
  }),

  // Показано не больше max аналогов: считаем аналоги из ответа get_part_offers, названные в тексте.
  analoguesShownAtMost: (max) => ({
    name: `аналогов в ответе не больше ${max}`,
    run: ({ answer, toolCalls }) => {
      const offers = toolCalls.filter((call) => call.name === 'get_part_offers').map(parse).filter(Boolean)
      const shown = new Set(
        offers.flatMap((offer) => offer.analogues).filter((a) => answer.includes(a.number)).map((a) => a.number),
      )
      return result(shown.size <= max, `${shown.size}: ${[...shown].join(', ')}`)
    },
  }),

  // Цена самого дешёвого аналога в наличии есть в ответе.
  mentionsCheapestAnalogue: () => ({
    name: 'называет самый дешёвый аналог в наличии',
    run: ({ answer, toolCalls }) => {
      const analogues = toolCalls
        .filter((call) => call.name === 'get_part_offers')
        .map(parse)
        .filter(Boolean)
        .flatMap((offer) => offer.analogues)
        .filter((a) => a.stock > 0 && a.minPrice !== null)
      if (!analogues.length) return result(false, 'инструмент не вернул аналогов в наличии')
      const cheapest = analogues.reduce((a, b) => (b.minPrice < a.minPrice ? b : a))
      const ok = pricesInText(answer).some((price) => Math.abs(price - cheapest.minPrice) < 0.005)
      return result(ok, `${cheapest.brand} ${cheapest.number} — ${cheapest.minPrice}`)
    },
  }),

  // Названа правильная минимальная цена конкретного производителя из find_part_brands.
  mentionsPriceOf: (brand) => ({
    name: `называет цену ${brand}`,
    run: ({ answer, toolCalls }) => {
      const found = toolCalls
        .filter((call) => call.name === 'find_part_brands')
        .map(parse)
        .filter(Boolean)
        .flatMap((response) => response.brands)
        .find((item) => same(item.brand, brand))
      if (!found || found.minPrice === null) return result(false, `${brand} нет в наличии или не найден`)
      const ok = pricesInText(answer).some((price) => Math.abs(price - found.minPrice) < 0.005)
      return result(ok, `ожидалась ${found.minPrice}`)
    },
  }),
}

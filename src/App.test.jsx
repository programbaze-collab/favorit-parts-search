import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeStore } from './app/store'
import { NOT_FOUND, part, warehouse } from './test/fixtures'

const BRANDS = {
  goods: [
    part('febi', 'FEBI', '01089', [warehouse(1082, 120)]),
    part('ap', 'AP', '01089'),
  ],
}

const FEBI_WITH_ANALOGUES = {
  goods: [
    part('febi', 'FEBI', '01089', [warehouse(1082, 120)], {
      analogues: [part('patron', 'PATRON', 'PCF4001', [warehouse(244, 54)])],
    }),
  ],
}

// Подменяем API: ответ зависит от параметров запроса.
function mockApi(respond) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const result = respond(Object.fromEntries(new URL(url).searchParams))
    if (result instanceof Error) throw result
    return new Response(JSON.stringify(result))
  })
}

function renderApp() {
  const user = userEvent.setup()
  render(
    <Provider store={makeStore()}>
      <App />
    </Provider>,
  )
  return { user, input: screen.getByRole('searchbox', { name: 'Артикул' }) }
}

describe('Подбор запчасти', () => {
  it('артикул → производители → предложения с ценой и остатком', async () => {
    const fetchMock = mockApi((params) => (params.analogues ? FEBI_WITH_ANALOGUES : BRANDS))
    const { user, input } = renderApp()

    // Поиск запускается сам, когда пользователь перестал печатать.
    await user.type(input, '01089')
    expect(await screen.findByRole('status')).toHaveTextContent('Ищем производителей')

    const febi = await screen.findByRole('button', { name: /FEBI/ })
    expect(screen.getByRole('button', { name: /AP/ })).toHaveTextContent('нет в наличии')

    await user.click(febi)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent(/FEBI.*искомая.*1\s082,00\s₽.*120 шт\./)
    expect(rows[1]).toHaveTextContent(/PATRON.*244,00\s₽.*54 шт\./)

    const lastCall = new URL(fetchMock.mock.lastCall[0]).searchParams
    expect(Object.fromEntries(lastCall)).toMatchObject({
      number: '01089',
      brand: 'FEBI',
      analogues: 'on',
    })
  })

  it('показывает понятное сообщение, если ничего не найдено', async () => {
    mockApi(() => NOT_FOUND)
    const { user, input } = renderApp()

    await user.type(input, 'zzz000{Enter}')

    expect(await screen.findByText('По артикулу «zzz000» ничего не найдено.')).toBeInTheDocument()
  })

  it('при сбое сети предлагает повторить запрос', async () => {
    let online = false
    mockApi(() => (online ? BRANDS : new TypeError('Failed to fetch')))
    const { user, input } = renderApp()

    await user.type(input, '01089{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером')

    online = true
    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByRole('button', { name: /FEBI/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

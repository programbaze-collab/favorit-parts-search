import { expect, test } from '@playwright/test'
import { NOT_FOUND, part, warehouse } from '../src/test/fixtures.js'

const API = '**/hs/hsprice/**'

const BRANDS = {
  goods: [
    part('febi', 'FEBI', '01089', [warehouse(1082, 120), warehouse(1314, 3, { code: 'СПБ' })]),
    part('ap', 'AP', '01089'),
  ],
}

const FEBI_WITH_ANALOGUES = {
  goods: [
    part('febi', 'FEBI', '01089', [warehouse(1082, 120), warehouse(1314, 3, { code: 'СПБ' })], {
      analogues: [
        part('patron', 'PATRON', 'PCF4001', [warehouse(244, 54)]),
        part('asam', 'ASAM', '30470'),
      ],
    }),
  ],
}

// Подменяем API Favorit: ответ зависит от параметров запроса.
// Возвращает список параметров всех запросов, чтобы проверить, что ушло на сервер.
async function mockApi(page, respond) {
  const requests = []
  await page.route(API, async (route) => {
    const params = Object.fromEntries(new URL(route.request().url()).searchParams)
    requests.push(params)
    const result = await respond(params)
    if (result === 'network-error') return route.abort('internetdisconnected')
    return route.fulfill({ json: result.body ?? result, status: result.status ?? 200 })
  })
  return requests
}

const searchBox = (page) => page.getByRole('searchbox', { name: 'Артикул' })

test.describe('Подбор запчасти', () => {
  test('артикул → производители → предложения с аналогами и складами', async ({ page }) => {
    const requests = await mockApi(page, (params) => (params.analogues ? FEBI_WITH_ANALOGUES : BRANDS))
    await page.goto('/')

    // Поиск запускается сам, когда пользователь перестал печатать.
    await searchBox(page).pressSequentially('01089')

    const febi = page.getByRole('button', { name: /FEBI/ })
    await expect(febi).toContainText('от 1 082,00 ₽')
    await expect(febi).toContainText('123 шт.')
    await expect(page.getByRole('button', { name: /AP/ })).toContainText('нет в наличии')

    await febi.click()

    await expect(page.getByRole('heading', { name: /FEBI 01089/ })).toContainText('аналогов: 2')
    const rows = page.locator('table.offers > tbody > tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('искомая')
    await expect(rows.nth(1)).toContainText('PATRON')
    await expect(rows.nth(2)).toContainText('ASAM')

    // Склады раскрываются под строкой, дешёвый склад — первым.
    await page.getByRole('button', { name: 'Склады (2)' }).click()
    const warehouses = page.locator('table.warehouses tbody tr')
    await expect(warehouses.nth(0)).toContainText('МСК')
    await expect(warehouses.nth(1)).toContainText('СПБ')
    await expect(warehouses.nth(0)).toContainText('29.10, заказ до 12:20')

    expect(requests.at(-1)).toMatchObject({ number: '01089', brand: 'FEBI', analogues: 'on' })
  })

  test('фильтр «Только в наличии» скрывает позиции без остатка', async ({ page }) => {
    await mockApi(page, (params) => (params.analogues ? FEBI_WITH_ANALOGUES : BRANDS))
    await page.goto('/')
    await searchBox(page).fill('01089')
    await page.getByRole('button', { name: /FEBI/ }).click()

    const rows = page.locator('table.offers > tbody > tr')
    await expect(rows).toHaveCount(3)

    await page.getByRole('switch', { name: 'Только в наличии' }).check()
    await expect(rows).toHaveCount(2)
    await expect(page.locator('table.offers')).not.toContainText('ASAM')
  })

  test('возврат к списку производителей не теряет результаты поиска', async ({ page }) => {
    const requests = await mockApi(page, (params) => (params.analogues ? FEBI_WITH_ANALOGUES : BRANDS))
    await page.goto('/')
    await searchBox(page).fill('01089')
    await page.getByRole('button', { name: /FEBI/ }).click()
    await expect(page.locator('table.offers')).toBeVisible()

    await page.getByRole('button', { name: '← Ко всем производителям' }).click()

    await expect(page.getByRole('button', { name: /AP/ })).toBeVisible()
    await expect(searchBox(page)).toHaveValue('01089')
    // Список производителей берётся из кэша, повторного запроса нет.
    expect(requests.filter((params) => !params.analogues)).toHaveLength(1)
  })

  test('короткий артикул не отправляет запрос и показывает подсказку', async ({ page }) => {
    const requests = await mockApi(page, () => BRANDS)
    await page.goto('/')

    await searchBox(page).fill('01')
    await searchBox(page).press('Enter')

    await expect(page.getByText('Введите не меньше 3 символов.')).toBeVisible()
    // Ждём дольше дебаунса (500 мс), чтобы убедиться, что запрос так и не ушёл.
    await page.waitForTimeout(800)
    expect(requests).toHaveLength(0)
  })
})

test.describe('Ошибки и пустые ответы', () => {
  test('ничего не найдено', async ({ page }) => {
    await mockApi(page, () => NOT_FOUND)
    await page.goto('/')
    await searchBox(page).fill('zzz000')
    await searchBox(page).press('Enter')

    await expect(page.getByText('По артикулу «zzz000» ничего не найдено.')).toBeVisible()
  })

  test('ошибка API со статусом 200 показывается по-русски', async ({ page }) => {
    await mockApi(page, () => ({ error: 'Request quota exceeded!' }))
    await page.goto('/')
    await searchBox(page).fill('01089')

    await expect(page.getByRole('alert')).toHaveText(/Превышен лимит запросов/)
  })

  test('ошибка сервера 500 с HTML вместо JSON', async ({ page }) => {
    await page.route(API, (route) => route.fulfill({ status: 500, body: '<html>Internal error</html>' }))
    await page.goto('/')
    await searchBox(page).fill('01089')

    await expect(page.getByRole('alert')).toHaveText(/Сервер вернул некорректный ответ \(500\)/)
  })

  test('при сбое сети можно повторить запрос', async ({ page }) => {
    let online = false
    await mockApi(page, () => (online ? BRANDS : 'network-error'))
    await page.goto('/')
    await searchBox(page).fill('01089')

    await expect(page.getByRole('alert')).toHaveText(/Нет связи с сервером/)

    online = true
    await page.getByRole('button', { name: 'Повторить' }).click()

    await expect(page.getByRole('button', { name: /FEBI/ })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test('на телефоне таблица предложений не вылезает за экран', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Проверка только для мобильной вёрстки')
  await mockApi(page, (params) => (params.analogues ? FEBI_WITH_ANALOGUES : BRANDS))
  await page.goto('/')
  await searchBox(page).fill('01089')
  await page.getByRole('button', { name: /FEBI/ }).click()
  await page.getByRole('button', { name: 'Склады (2)' }).click()

  // Подписи колонок переезжают в карточки, шапка таблицы скрыта.
  await expect(page.locator('table.offers > thead')).toBeHidden()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

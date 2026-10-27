import { describe, expect, it } from 'vitest'
import { NOT_FOUND, part, warehouse } from '../test/fixtures'
import { toBrands, toOffer, toOffers } from './normalize'

describe('toOffer', () => {
  it('берёт цену со складов, а не из устаревшего корневого поля', () => {
    const offer = toOffer(part('1', 'FEBI', '01089', [warehouse(1161.6, 4), warehouse(1082, 120)]))
    expect(offer.minPrice).toBe(1082)
    expect(offer.maxPrice).toBe(1161.6)
  })

  it('не считает цену складов с нулевым остатком', () => {
    const offer = toOffer(part('1', 'FEBI', '01089', [warehouse(500, 0), warehouse(700, 2)]))
    expect(offer.minPrice).toBe(700)
  })

  it('без складов цены нет', () => {
    expect(toOffer(part('1', 'AP', '01089')).minPrice).toBeNull()
  })
})

describe('toBrands', () => {
  it('«не найдено» (массив с пустой структурой) превращает в пустой список', () => {
    expect(toBrands(NOT_FOUND.goods)).toEqual([])
  })

  it('ставит детали в наличии выше, затем по цене', () => {
    const brands = toBrands([
      part('1', 'AP', '01089'),
      part('2', 'FEBI', '01089', [warehouse(1082, 5)]),
      part('3', 'ASAM', '01089', [warehouse(86.88, 1)]),
    ])
    expect(brands.map((b) => b.brand)).toEqual(['ASAM', 'FEBI', 'AP'])
  })
})

describe('toOffers', () => {
  it('ставит искомую деталь первой, а аналоги сортирует и не дублирует', () => {
    const analogues = [
      part('a1', 'Miles', 'AFBR060', [warehouse(12009.6, 1)]),
      part('a2', 'Hepco', '53612/1'),
      part('a3', 'PATRON', 'PCF4001', [warehouse(244, 50)]),
      part('a3', 'PATRON', 'PCF4001', [warehouse(244, 50)]),
    ]
    const offers = toOffers([part('o', 'FEBI', '01089', [], { analogues })])

    expect(offers.map((o) => [o.brand, o.isOriginal])).toEqual([
      ['FEBI', true],
      ['PATRON', false],
      ['Miles', false],
      ['Hepco', false],
    ])
  })

  it('пустой ответ — пустой список', () => {
    expect(toOffers(NOT_FOUND.goods)).toEqual([])
  })
})

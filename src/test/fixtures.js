// Фрагменты реальных ответов API, урезанные до нужного.

export const warehouse = (price, stock, extra = {}) => ({
  code: 'МСК',
  id: `wh-${price}-${stock}`,
  own: false,
  price,
  shipmentDate: '2026-10-29T12:20:00+03:00',
  stock,
  ...extra,
})

export const part = (goodsID, brand, number, warehouses = [], extra = {}) => ({
  goodsID,
  brand,
  number,
  name: `Деталь ${brand}`,
  count: warehouses.reduce((sum, w) => sum + w.stock, 0),
  price: 99999, // устаревшее поле — интерфейс не должен его показывать
  rate: 1,
  warehouses,
  ...extra,
})

export const NOT_FOUND = {
  goods: [
    {
      brand: '',
      count: 0,
      goodsID: '00000000-0000-0000-0000-000000000000',
      name: '',
      number: '',
      price: 0,
      rate: 0,
      warehouses: [],
    },
  ],
}

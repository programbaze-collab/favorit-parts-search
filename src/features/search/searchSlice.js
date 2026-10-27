import { createSlice } from '@reduxjs/toolkit'

// Состояние сценария подбора: введённый артикул и выбранная деталь.
// Сами данные с сервера (и их загрузка/ошибки) живут в кэше RTK Query.
const searchSlice = createSlice({
  name: 'search',
  initialState: {
    article: '',
    selected: null, // { brand, number }
  },
  reducers: {
    articleChanged(state, action) {
      if (state.article === action.payload) return
      state.article = action.payload
      state.selected = null
    },
    partSelected(state, action) {
      state.selected = action.payload
    },
    backToBrands(state) {
      state.selected = null
    },
  },
})

export const { articleChanged, partSelected, backToBrands } = searchSlice.actions
export default searchSlice.reducer

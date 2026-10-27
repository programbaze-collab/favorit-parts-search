import { configureStore } from '@reduxjs/toolkit'
import { favoritApi } from '../api/favoritApi'
import searchReducer from '../features/search/searchSlice'

export function makeStore() {
  return configureStore({
    reducer: {
      search: searchReducer,
      [favoritApi.reducerPath]: favoritApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(favoritApi.middleware),
  })
}

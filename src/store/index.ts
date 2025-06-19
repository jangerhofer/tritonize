import { configureStore } from '@reduxjs/toolkit'
import colorReducer from './colorSlice'
import fileReducer from './fileSlice'

export const store = configureStore({
  reducer: {
    color: colorReducer,
    file: fileReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['file/addFile'],
        ignoredPaths: ['file.file']
      }
    })
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
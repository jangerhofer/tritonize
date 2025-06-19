import { configureStore } from '@reduxjs/toolkit'
import colorReducer from './color_slice'
import fileReducer from './file_slice'

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
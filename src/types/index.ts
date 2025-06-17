// Color is represented as RGB array
export type Color = [number, number, number]

// Redux state types
export interface ColorState {
  colors: Color[]
  blurAmount: number
}

export interface FileState {
  file: File | null
}

export interface RootState {
  ColorReducer: ColorState
  FileReducer: FileState
}

// Action types
export interface ColorChangeAction {
  type: 'COLOR/CHANGE'
  index: number
  color: Color
}

export interface ColorAddAction {
  type: 'COLOR/ADD'
  color: Color
}

export interface ColorResetAction {
  type: 'COLOR/RESET_LIST'
}

export interface ColorBlurChangeAction {
  type: 'COLOR/BLUR_CHANGE'
  blurAmount: number
}

export interface ColorRemoveAction {
  type: 'COLOR/REMOVE'
  color: Color
}

export interface FileAddAction {
  type: 'FILE/ADD'
  file: File
}

export interface FileClearAction {
  type: 'FILE/CLEAR'
}

export type ColorAction = 
  | ColorChangeAction 
  | ColorAddAction 
  | ColorResetAction 
  | ColorBlurChangeAction 
  | ColorRemoveAction

export type FileAction = 
  | FileAddAction 
  | FileClearAction

export type AppAction = ColorAction | FileAction
import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')
const root = createRoot(rootEl)

root.render(<App/>)

if (import.meta.hot) {
	import.meta.hot.accept('./App.tsx', () => {
		root.render(<App/>)
	})
}

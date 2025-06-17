import React from 'react'
import FilePicker from './components/filePicker.tsx'
import Menu from './components/menu.tsx'
import {Provider} from 'react-redux'
import {createStore} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'
import { ExternalLink } from 'lucide-react'
import rootReducer from './reducers/index'

const enhancer = composeWithDevTools()
const store = createStore(rootReducer, {}, enhancer)

function App() {
	return (
		<Provider store={store}>
			<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
				<div className="container mx-auto px-4 py-8">
					<header className="text-center mb-8">
						<h1 className="text-4xl font-bold text-slate-800 mb-4">Tritonize</h1>
						<p className="text-slate-600 mb-2">The filter may take a short while to apply to all images. Please be patient.</p>
						<a 
							href="https://github.com/jangerhofer/tritonize" 
							target="_blank" 
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors"
						>
							Code and explanation here! <ExternalLink size={16} />
						</a>
					</header>
					
					<div className="grid lg:grid-cols-3 gap-8">
						<div className="lg:col-span-1">
							<div className="bg-white rounded-lg shadow-sm border p-6">
								<Menu/>
							</div>
						</div>
						<div className="lg:col-span-2">
							<div className="bg-white rounded-lg shadow-sm border p-6 min-h-[60vh] flex items-center justify-center">
								<FilePicker/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</Provider>
	)
}

export default App

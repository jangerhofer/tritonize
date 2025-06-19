import React from 'react'
import FilePicker from './components/filePicker.tsx'
import Menu from './components/menu.tsx'
import {Provider} from 'react-redux'
import {store} from './store/index'

function App() {
	return (
		<Provider store={store}>
			<div className="min-h-screen bg-gray-50">
				<div className="max-w-7xl mx-auto px-4 py-8">
					<header className="text-center mb-8">
						<h1 className="text-4xl font-bold text-gray-900 mb-4">Tritonize</h1>
						<p className="text-gray-600 mb-2">The filter may take a short while to apply to all images. Please be patient.</p>
						<a 
							href="https://github.com/jangerhofer/tritonize" 
							target="_blank" 
							rel="noopener noreferrer"
							className="text-blue-600 hover:text-blue-800"
						>
							Code and explanation here!
						</a>
					</header>
					
					<div className="grid lg:grid-cols-3 gap-8">
						<div className="lg:col-span-1">
							<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
								<Menu/>
							</div>
						</div>
						<div className="lg:col-span-2">
							<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-96 flex items-center justify-center">
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

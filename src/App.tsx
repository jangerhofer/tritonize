import { type Component } from 'solid-js'
import FilePicker from './components/file_picker'
import Menu from './components/menu'

const App: Component = () => {
	return (
		<div class="min-h-screen bg-gray-50">
			<div class="max-w-7xl mx-auto px-4 py-8">
				<header class="text-center mb-8">
					<h1 class="text-4xl font-bold text-gray-900 mb-4">
						Tritonize
					</h1>
					<p class="text-gray-600 mb-2">
						The filter may take a short while to apply to all
						images. Please be patient.
					</p>
					<a
						href="https://github.com/jangerhofer/tritonize"
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:text-blue-800"
					>
						Code and explanation here!
					</a>
				</header>

				<div class="grid lg:grid-cols-3 gap-8">
					<div class="lg:col-span-1">
						<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
							<Menu />
						</div>
					</div>

					<div class="lg:col-span-2">
						<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-96 flex items-center justify-center">
							<FilePicker />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default App

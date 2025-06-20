import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
	plugins: [solid()],
	base: '/tritonize/',
	build: {
		outDir: 'build',
	},
	server: {
		port: 3000,
		host: '0.0.0.0',
		open: true,
	},
	define: {
		global: 'globalThis',
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
})

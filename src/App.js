import React, {Component} from 'react'
import Radium from 'radium'
import FilePicker from './components/filePicker'
import Menu from './components/menu'
import {Provider} from 'react-redux'
import {createStore} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'

import 'bulma/css/bulma.css'

const styles = {
	leftGrid: {
		justifyContent: 'center',
		alignItems: 'center',
		display: 'flex'
	},
	rightGrid: {
	},
	imageDisplay: {
		minHeight: '100vh',
		justifyContent: 'center',
		alignItems: 'center',
		display: 'flex',
		margin: '1rem'
	}
}

// Set up Redux
const colorReducer = (state = {}, action) => {
	switch (action.type) {
		case 'COLOR/RESET_LIST':
			return {
				...state,
				colors: []
			}
		default:
			return state
	}
}

const enhancer = composeWithDevTools()
const store = createStore(colorReducer, {
	colors: [
		[0, 0, 0]
	]
}, enhancer)


class App extends Component {

	constructor() {
		super()
		this.state = {files: []}
	}

	render() {
		return (
			<Provider store={store}>
			<div className="App">
				<div className="columns is-desktop">
					<div className="column is-one-third-desktop has-text-centered" style={styles.leftGrid}>
						<Menu/>
					</div>
					<div className="column" style={styles.rightGrid}>
						<div style={styles.imageDisplay}>
							<FilePicker/>
						</div>
					</div>
				</div>
			</div>
			</Provider>
		)
	}
}

export default Radium(App)

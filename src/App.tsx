import React, {Component} from 'react'
import Radium from 'radium'
import FilePicker from './components/filePicker.tsx'
import Menu from './components/menu.tsx'
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
import rootReducer from './reducers/index'

const enhancer = composeWithDevTools()
const store = createStore(rootReducer, {}, enhancer)

class App extends Component {

	render() {
		return (
			<Provider store={store}>
				<div className="App">
					<center><h3>The filter may take a short while to apply to all images.  Please be patient.</h3><p><a href="https://github.com/jangerhofer/tritonize" target="_blank">Code and explanation here!</a></p></center>
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

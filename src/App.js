import React, {Component} from 'react'
import Radium from 'radium'
import Dropzone from 'react-dropzone'

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
		display: 'flex'
	}
}

class App extends Component {

	constructor() {
		super()
		this.state = {files: []}
	}

	render() {
		return (
			<div className="App">
				<div className="columns is-desktop">
					<div className="column is-one-third-desktop has-text-centered" style={styles.leftGrid}>
					MENU BAR HERE
					</div>
					<div className="column" style={styles.rightGrid}>
						<div style={styles.imageDisplay}>

					IMAGE PICKER HERE
					</div>
					</div>
				</div>
			</div>
		)
	}
}

export default Radium(App)

import React, {Component} from 'react'
import {connect} from 'react-redux'
import ColorCell from './colorCell'

const styles = {
	list: {
		border: '1px solid black',
		padding: '2rem'
	}
}

class ColorList extends Component {
	render() {
		if (this.props.colorList.length === 0) {
			return (
				<div>
					<ul style={styles.list}>
						<ColorCell color={'rgb(255,255,255)'}>+</ColorCell>
					</ul>
				</div>)
		}
		return (<div>
			<ul style={styles.list}>
				{this.props.colorList.map(color => {
					return <ColorCell key={color} color={`rgb(${color[0]},${color[1]}, ${color[2]})`}/>
				})}
				<ColorCell isNew color={'rgb(255,255,255)'}>+</ColorCell>
			</ul>
			<button onClick={this.props.handleClearColors}>Reset</button>
		</div>)
	}
}

const ColorListWithData = connect(
  state => ({
	colorList: state.ColorReducer.colors
}), dispatch => {
	return {
		handleClearColors: () => dispatch({type: 'COLOR/RESET_LIST'})
	}
}
)(ColorList)

export default ColorListWithData

import React, {Component} from 'react'
import {connect} from 'react-redux'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'

import ColorCell from './colorCell.tsx'

const styles = {
	list: {
		border: '1px solid black',
		padding: '2rem'
	}
}

class ColorList extends Component {
	render() {
		return (
			<div>
				<ul style={styles.list}>
					{this.props.colorList.map((color, i) => {
						return <ColorCell key={i} index={i} color={`rgb(${color[0]},${color[1]},${color[2]})`}/>
					})}
					<ColorCell isNew color={'rgb(255,255,255)'}>+</ColorCell>
				Blur Amount: <Slider
					onChange={val => this.props.handleBlurChange(val)} min={0} max={5} defaultValue={this.props.blurAmount} disabled
					                                                                                                        />
					{this.props.blurAmount}
				</ul>
				<button onClick={this.props.handleClearColors}>Clear Colors</button>
				<button onClick={this.props.handleClearFile}>Clear File</button>
			</div>)
	}
}

const ColorListWithData = connect(
  state => ({
	colorList: state.ColorReducer.colors,
	blurAmount: state.ColorReducer.blurAmount
}), dispatch => {
	return {
		handleClearColors: () => dispatch({type: 'COLOR/RESET_LIST'}),
		handleClearFile: () => dispatch({type: 'FILE/CLEAR'}),
		handleBlurChange: blurAmount => dispatch({type: 'COLOR/BLUR_CHANGE', blurAmount})
	}
}
)(ColorList)

export default ColorListWithData

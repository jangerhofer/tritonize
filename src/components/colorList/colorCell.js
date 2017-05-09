import React, {Component} from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Tooltip} from 'react-tippy'
import {SketchPicker} from 'react-color'
import chroma from 'chroma-js'
import {FaTimesCircle} from 'react-icons/lib/fa'

const styleFunc = props => ({
	li: {
		margin: '2rem'
	},
	cell: {
		backgroundColor: props.color,
		borderRadius: '1rem',
		border: '1px solid black',
		minHeight: '2rem',
		minWidth: '10rem',
		display: 'inline-block'
	}
})

class ColorCell extends Component {

	handleClick() {
		if (this.props.isNew) {
			this.props.handleAddColor(chroma('white').rgb())
		}
	}

	render() {
		const styles = styleFunc(this.props)
		return (<div style={styles.li} onClick={this.handleClick.bind(this)}>

			{this.props.isNew ? <div style={styles.cell}>{this.props.children}</div> : <Tooltip
				html={(<SketchPicker onChange={this.props.handleColorChange}/>)}
				position="bottom"
				trigger="click"
				>
				<div style={styles.cell}>{this.props.children}</div>
			</Tooltip> }

			{this.props.isNew ? null : <FaTimesCircle onClick={this.props.handleDeleteColor}/> }
		</div>

		)
	}
}

export default connect(null, (dispatch, ownProps) => ({
	handleDeleteColor: () => {
		dispatch({type: 'COLOR/REMOVE', color: chroma(ownProps.color).rgb()})
	},
	handleAddColor: color => dispatch({type: 'COLOR/ADD', color}),
	handleColorChange: (color, event) => {
		dispatch({type: 'COLOR/CHANGE', index: ownProps.index, color: [color.rgb.r, color.rgb.g, color.rgb.b]})
	}
}))(ColorCell)

ColorCell.PropTypes = {
	color: PropTypes.string
}

ColorCell.defaultProps = {
	color: 'white'
}

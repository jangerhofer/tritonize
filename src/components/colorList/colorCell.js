import React, {Component} from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Tooltip} from 'react-tippy'
import {SketchPicker} from 'react-color'
import Chroma from 'chroma-js'
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
	render() {
		const styles = styleFunc(this.props)
		return (<div style={styles.li}>

			<Tooltip
				html={(<SketchPicker/>)}
				position="bottom"
				trigger="click"
				>
				<div style={styles.cell}>{this.props.children}</div>
			</Tooltip>
			<FaTimesCircle onClick={this.props.handleDeleteColor}/>
		</div>

		)
	}
}

export default connect(null, (dispatch, ownProps) => ({
	handleDeleteColor: () => {
		dispatch({type: 'COLOR/REMOVE', color: Chroma(ownProps.color).rgb()})
	}
}))(ColorCell)

ColorCell.PropTypes = {
	color: PropTypes.string
}

ColorCell.defaultProps = {
	color: 'white'
}

import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {Tooltip} from 'react-tippy'
import {SketchPicker} from 'react-color'

const styleFunc = props => ({
	cell: {
		backgroundColor: props.color,
		borderRadius: '1rem',
		border: '1px solid black',
		minHeight: '2rem',
		minWidth: '10rem',
		margin: '2rem'
	}
})

export default class ColorCell extends Component {
	render() {
		const styles = styleFunc(this.props)
		return (<div>

			<Tooltip
				html={(<SketchPicker/>)}
				position="bottom"
				trigger="click"
				>
				<div style={styles.cell}>{this.props.children}</div>
			</Tooltip>

		</div>

		)
	}
}

ColorCell.PropTypes = {
	color: PropTypes.string
}

ColorCell.defaultProps = {
	color: 'white'
}

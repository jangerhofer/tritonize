import React, {Component} from 'react'
import Radium from 'radium'
import FilePicker from './components/filePicker'
import Menu from './components/menu'
import {Provider} from 'react-redux'
import {createStore} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'

import 'bulma/css/bulma.css'

import {Node, Shaders} from 'gl-react'
import {Surface} from "gl-react-dom";

const shaders = Shaders.create({
  helloGL: {
    frag: `
		uniform sampler2D t;
		precision highp float;
		uniform float colorCount;
		uniform vec4 colorValues[100];
		varying vec2 uv;
		void main () {
			vec4 c = texture2D(t, uv);
			float GrayScale =  (c.r * 299.0 / 1000.0) + (c.g * 587.0 / 1000.0) + (c.b * 114.0 / 1000.0);
    	float sigmoidThreshold = 1.0 / (1.0 + pow(2.7182818284590452353602874713527, (-((GrayScale - 128.0) /32.0))));
			float matchingIndex = floor(sigmoidThreshold * colorCount);
			int index = int(matchingIndex);
			for (int k = 0; k < 10; ++k) {
    		if (index == k) {
					gl_FragColor = vec4(colorValues[k].x,colorValues[k].y,colorValues[k].z,1.0);
				}
			}
		}`
  }
});

export const Saturate = ({ colorList, children }) => {
const colorValues = [];
for (let i = 0; i < 4 * colorList.length; i += 4) {
  const buffer = [0.0,0.0,0.0,0.0];
  const byteOffset = i * Float32Array.BYTES_PER_ELEMENT;
  const length = 4;
  colorValues.push(new Float32Array(buffer, byteOffset, length));
}

colorValues[0].set([0.5, 1.0, 0.0, 1.0]);
console.log(colorValues);
	return (
		<Node
			shader={shaders.helloGL}
			uniforms={{ t: children, colorValues, colorCount : colorValues.length }}
		/>
	)
}


export default class Example extends Component {
  render() {
		let surfaces = []
		for (var i = 0; i < 2; i++) {
			surfaces.push(<Surface key={i} width={480} height={300}>
				<Saturate {...this.props}>
					https://i.imgur.com/uTP9Xfr.jpg
				</Saturate>
				</Surface>)
			}

    return (
			<div>
				{surfaces}
		</div>
    );
  }
  static defaultProps = {
    contrast: 1,
    saturation: 1,
    brightness: 1,
		colorList : [[0.0,0.0,1.0,1.0],[0.0,0.0,1.0,1.0],[0.0,0.0,1.0,1.0],[0.0,0.0,1.0,1.0],]
  };
}

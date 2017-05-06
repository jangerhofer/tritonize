import React, {Component} from 'react';
import logo from './logo.svg';
import './App.css';
import Dropzone from 'react-dropzone';

const sigmoid = x => (1.0 / (1.0 + Math.pow(Math.E, (-((x - 128.0) / 32.0)))));

class App extends Component {

	constructor() {
		super();
		this.state = {files: []};
	}


	render() {
		return (
      <div className="App">

      </div>
		);
	}
}

export default App;

import React, {Component} from 'react';
import logo from './logo.svg';
import './App.css';
import Dropzone from 'react-dropzone';
import jimp from 'jimp';
import Cmb from 'js-combinatorics';

const sigmoid = x => (1.0 / (1.0 + Math.pow(Math.E, (-((x - 128.0) / 32.0)))));

class App extends Component {

	constructor() {
		super();
		this.state = {files: []};
	}

	onDrop(files) {
		jimp.read(files[0].name, (err, lenna) => {
			console.log(lenna);
		});
		this.setState({
			files
		});
	}

	render() {
		return (
      <div className="App">

        <Dropzone onDrop={this.onDrop.bind(this)}>
            <p>Try dropping some files here, or click to select files to upload.</p>
          </Dropzone>
        <aside>
          <h2>Dropped files</h2>
          <ul>
            {
              this.state.files.map(f => <li key={f.name}>{f.name} - {f.size} bytes</li>)
            }
          </ul>
        </aside>

      </div>
		);
	}
}

export default App;

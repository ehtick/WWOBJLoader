/**
 * @author mrdoob / http://mrdoob.com/
 */

'use strict';

THREE.OBJLoader = (function () {

	var REGEX = {
		// v float float float
		vertex_pattern: /^v\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
		// vn float float float
		normal_pattern: /^vn\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
		// vt float float
		uv_pattern: /^vt\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/,
		// f vertex vertex vertex
		face_vertex: /^f\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?/,
		// f vertex/uv vertex/uv vertex/uv
		face_vertex_uv: /^f\s+(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)(?:\s+(-?\d+)\/(-?\d+))?/,
		// f vertex/uv/normal vertex/uv/normal vertex/uv/normal
		face_vertex_uv_normal: /^f\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)(?:\s+(-?\d+)\/(-?\d+)\/(-?\d+))?/,
		// f vertex//normal vertex//normal vertex//normal
		face_vertex_normal: /^f\s+(-?\d+)\/\/(-?\d+)\s+(-?\d+)\/\/(-?\d+)\s+(-?\d+)\/\/(-?\d+)(?:\s+(-?\d+)\/\/(-?\d+))?/,
		// o object_name | g group_name
		object_pattern: /^[og]\s*(.+)?/,
		// s boolean
		smoothing_pattern: /^s\s+(\d+|on|off)/,
		// mtllib file_reference
		material_library_pattern: /^mtllib /,
		// usemtl material_name
		material_use_pattern: /^usemtl /
	};

	function OBJLoader( manager ) {
		this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

		this.materials = null;
		this.group = null;
		this.lineCount = 0;
		this.loadAsArrayBuffer = true;
		this.trimFunction = null;
		this.path = null;

		this.reInit( true );
	}

	OBJLoader.prototype.setPath = function ( value ) {
		this.path = value;
	};

	OBJLoader.prototype.setMaterials = function ( materials ) {
		this.materials = materials;
	};

	/**
	 * When this is set the ResponseType of the XHRLoader is set to arraybuffer
	 * and parseArrayBuffer is used.
	 * @param loadAsArrayBuffer
	 */
	OBJLoader.prototype.setLoadAsArrayBuffer = function ( loadAsArrayBuffer ) {
		this.loadAsArrayBuffer = loadAsArrayBuffer;
	};

	OBJLoader.prototype.reInit = function ( loadAsArrayBuffer, path ) {
		this.materials = null;
		this.container = new THREE.Group();
		this.lineCount = 0;
		this.loadAsArrayBuffer = loadAsArrayBuffer;

		// Define trim function to use once
		// Faster to just trim left side of the line. Use if available.
		var trimLeft = function ( line ) { return line.trimLeft(); };
		var trimNormal = function ( line ) { return line.trim(); };
		this.trimFunction = typeof ''.trimLeft === 'function' ?  trimLeft : trimNormal;

		this.setPath( path );
	};

	OBJLoader.prototype.load = function ( url, onLoad, onProgress, onError ) {
		var scope = this;

		var loader = new THREE.XHRLoader( scope.manager );
		loader.setPath( this.path );
		loader.setResponseType( this.loadAsArrayBuffer ? 'arraybuffer' : 'text' );
		loader.load( url, function ( loadedContent ) {

			onLoad( scope.parse( loadedContent ) );

		}, onProgress, onError );
	};

	OBJLoader.prototype.parse = function ( loadedContent ) {

		if ( this.loadAsArrayBuffer ) {

			console.time( 'ParseAB' );
			var view = new Uint8Array( loadedContent );
			for ( var code, line = '', length = view.byteLength, i = 0; i < length; i++ ) {

				code = view[ i ];
				line = this.checkLine( String.fromCharCode( code ), code, line );

			}
			console.timeEnd( 'ParseAB' );

		} else {

			console.time( 'ParseText' );
			for ( var char, line = '', length = loadedContent.length, i = 0; i < length; i++ ) {

				char = text[ i ];
				line = this.checkLine( char, char.charCodeAt( 0 ), line );

			}
			console.timeEnd( 'ParseText' );

		}
		console.log( 'Line Count: ' + this.lineCount );

		return this.container;
	};


	OBJLoader.prototype.checkLine = function ( char, code, line ) {
		// process line on occurrence of CR or LF
		if ( code === 10 || code === 13 ) {

			// if CR exists line will be length 0 afterwards
			// LF with CR will then do nothing
			// LF without CR will have line.length > 0
			if ( line.length > 0) {

				this.processLine( line );
				line = '';

			}

		} else {

			line += char;

		}
		return line;
	};


	OBJLoader.prototype.processLine = function ( line ) {
/*
		if ( this.lineCount < 10 ) { console.log( line ); }

		var sizeA = line.length;
		line = this.trimFunction( line );
		var sizeB = line.length;
		if ( sizeA !== sizeB ) {
			console.log( sizeA - sizeB );
		}
*/
		this.lineCount++;
	};

	return OBJLoader;
})();

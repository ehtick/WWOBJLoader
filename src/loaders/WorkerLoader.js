if ( THREE.WorkerLoader === undefined ) { THREE.WorkerLoader = {} }

/**
 *
 * @param {THREE.DefaultLoadingManager} manager
 * @param {object} [loader]
 * @param {object} [loaderConfig]
 * @constructor
 */
THREE.WorkerLoader = function ( manager, loader, loaderConfig ) {

	console.info( 'Using THREE.WorkerLoader version: ' + THREE.WorkerLoader.WORKER_LOADER_VERSION );
	this.manager = THREE.WorkerLoader.Validator.verifyInput( manager, THREE.DefaultLoadingManager );
	this.loadingTask = new THREE.WorkerLoader.LoadingTask( 'WorkerLoader_LoadingTask' );
	if ( THREE.WorkerLoader.Validator.isValid( loader ) ) this.loadingTask.setLoader( loader, loaderConfig );
};
THREE.WorkerLoader.WORKER_LOADER_VERSION = '1.0.0-dev';


THREE.WorkerLoader.prototype = {

	constructor: THREE.WorkerLoader,

	/**
	 *
	 * @param {object} loader
	 * @param {object} [loaderConfig]
	 * @returns {THREE.WorkerLoader}
	 */
	setLoader: function ( loader, loaderConfig ) {
		this.loadingTask.setLoader( loader, loaderConfig );
		return this;
	},

	/**
	 *
	 * @param {THREE.WorkerLoader.LoadingTask} loadingTask
	 */
	setLoadingTask: function ( loadingTask ) {
		this.loadingTask = THREE.WorkerLoader.Validator.verifyInput( loadingTask, this.loadingTask );
	},

	/**
	 *
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	getLoadingTask: function () {
		return this.loadingTask;
	},

	/**
	 * Execute a fully configured {@link THREE.WorkerLoader.LoadingTask}.
	 *
	 * @param {THREE.WorkerLoader.LoadingTask} loadingTask
	 * @returns {THREE.WorkerLoader}
	 */
	executeLoadingTask: function ( loadingTask ) {
		this.setLoadingTask( loadingTask );
		this.loadingTask.execute();
		return this;
	},

	/**
	 * Configure the existing {@link THREE.WorkerLoader.LoadingTask} with the supplied parameters.
	 *
	 * @param {THREE.WorkerLoader.LoadingTaskConfig} loadingTaskConfig
	 * @param {THREE.WorkerLoader.WorkerSupport} [workerSupport]
	 * @returns {THREE.WorkerLoader}
	 */
	executeLoadingTaskConfig: function ( loadingTaskConfig, workerSupport ) {
		this.loadingTask.execute( loadingTaskConfig, workerSupport );
		return this;
	},

	/**
	 * Use this method to load a file from the given URL and parse it asynchronously.
	 * @memberOf THREE.WorkerLoader
	 *
	 * @param {string}  url A string containing the path/URL of the file to be loaded.
	 * @param {function} onLoad A function to be called after loading is successfully completed. The function receives loaded Object3D as an argument.
	 * @param {function} [onMesh] A function to be called after a new mesh raw data becomes available (e.g. alteration).
 	 * @param {function} [onProgress] A function to be called while the loading is in progress. The argument will be the XMLHttpRequest instance, which contains total and Integer bytes.
	 * @param {function} [onError] A function to be called if an error occurs during loading. The function receives the error as an argument.
	 * @returns {THREE.WorkerLoader}
	 */
	loadAsync: function ( url, onLoad, onMesh, onProgress, onError ) {
		this.loadingTask.addResourceDescriptor( new THREE.WorkerLoader.ResourceDescriptor( 'URL', 'url_loadAsync', url ) )
			.updateCallbacksPipeline( null, null, onLoad )
			.updateCallbacksParsing( onMesh, null )
			.updateCallbacksFileLoading( onProgress, onError )
			.execute();
		return this;
	},

	/**
	 * Parses content asynchronously from arraybuffer.
	 *
	 * @param {arraybuffer} content data as Uint8Array
	 * @param {function} onLoad Called after worker successfully completed loading
	 * @param {function} [onMesh] Called after worker successfully delivered a single mesh
	 * @param {Object} [parserConfiguration] Provide additional instructions to the parser
	 * @returns {THREE.WorkerLoader}
	 */
	parseAsync: function ( content, onLoad, onMesh, parserConfiguration ) {
		var resourceDescriptor = new THREE.WorkerLoader.ResourceDescriptor( 'Buffer', null, content );
		resourceDescriptor.setParserConfiguration( parserConfiguration );

		this.loadingTask.addResourceDescriptor( resourceDescriptor )
			.updateCallbacksPipeline( null, null, onLoad )
			.updateCallbacksParsing( onMesh, null )
			.execute();
		return this;
	}
};

/**
 *
 * @param {String} description
 * @constructor
 */
THREE.WorkerLoader.LoadingTask = function ( description ) {
	this.logging = {
		enabled: true,
		debug: false
	};
	this.description = description;

	this.workerSupport = null;
	this.meshBuilder = null;

	this.baseObject3d = new THREE.Group();
	this.instanceNo = 0;
	this.terminateWorkerOnLoad = true;
	this.forceWorkerDataCopy = false;
	this.enforceSync = false;

	this.sendMaterials = true;
	this.sendMaterialsJson = false;

	this.loader = {
		ref: null,
		config: {}
	};
	this.resourceDescriptors = [];
	this.resetResourceDescriptors();

	this.callbacks = {
		app: {
			onReport: null
		},
		parse: {
			onMesh: null,
			onMaterials: null
		},
		load: {
			onProgress: null,
			onError: null
		},
		pipeline: {
			onComplete: null,
			onCompleteFileLoading: null,
			onCompleteParsing: null
		}
	};
};


THREE.WorkerLoader.LoadingTask.applyConfiguration = function ( scope, applicableConfiguration, forceCreation ) {
	// fast-fail
	if ( scope === undefined || scope === null || applicableConfiguration === undefined || applicableConfiguration === null ) return;

	var property, value;
	for ( property in applicableConfiguration ) {

		value = applicableConfiguration[ property ];
		if ( scope.hasOwnProperty( property ) || forceCreation ) {

			scope[ property ] = value;

		}
	}
};

THREE.WorkerLoader.LoadingTask.prototype = {

	constructor: THREE.WorkerLoader.LoadingTask,

	/**
	 * Enable or disable logging in general (except warn and error), plus enable or disable debug logging.
	 *
	 * @param enabled
	 * @param debug
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setLogging: function ( enabled, debug ) {
		this.logging.enabled = enabled === true;
		this.logging.debug = debug === true;
		return this;
	},

	/**
	 * The instance number.
	 *
	 * @param {number} instanceNo
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setInstanceNo: function ( instanceNo ) {
		this.instanceNo = THREE.WorkerLoader.Validator.verifyInput( instanceNo, this.instanceNo );
		return this;
	},

	/**
	 * Defines where meshes shall be attached to.
	 *
	 * @param {THREE.Object3D} baseObject3d
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setBaseObject3d: function ( baseObject3d ) {
		this.baseObject3d = THREE.WorkerLoader.Validator.verifyInput( baseObject3d, this.baseObject3d );
		return this;
	},

	/**
	 *
	 * @param {Boolean} terminateWorkerOnLoad
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setTerminateWorkerOnLoad: function ( terminateWorkerOnLoad ) {
		this.terminateWorkerOnLoad = terminateWorkerOnLoad === true;
		return this;
	},

	/**
	 * Forces all ArrayBuffers to be transferred to worker to be copied.
	 *
	 * @param {boolean} forceWorkerDataCopy True or false.
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setForceWorkerDataCopy: function ( forceWorkerDataCopy ) {
		this.forceWorkerDataCopy = forceWorkerDataCopy === true;
		return this;
	},

	/**
	 *
	 * @param {Boolean} enforceSync
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setEnforceSync: function ( enforceSync ) {
		this.enforceSync = enforceSync === true;
		return this;
	},

	/**
	 *
	 * @param {object} loader
	 * @param {object} [loaderConfig]
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	setLoader: function ( loader, loaderConfig ) {
		if ( ! THREE.WorkerLoader.Validator.isValid( loader ) ) throw 'Unable to continue. You have not specified a loader!';
		this.loader.ref = loader;
		this.loader.config = THREE.WorkerLoader.Validator.verifyInput( loaderConfig, this.loader.config );
		return this;
	},

	/**
	 *
	 * @param resourceDescriptor
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	addResourceDescriptor: function ( resourceDescriptor ) {
		this.resourceDescriptors.push( resourceDescriptor );
		return this;
	},

	/**
	 *
	 * @param resourceDescriptors
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	resetResourceDescriptors: function ( resourceDescriptors ) {
		this.resourceDescriptors = Array.isArray( resourceDescriptors ) ? resourceDescriptors : this.resourceDescriptors;
		return this;
	},

	/**
	 *
	 * @param {Function} onMesh
	 * @param {Function} onMaterials
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	updateCallbacksParsing: function ( onMesh, onMaterials ) {
		this.callbacks.parse.onMesh = THREE.WorkerLoader.Validator.verifyInput( onMesh, this.callbacks.parse.onMesh );
		this.callbacks.parse.onMaterials = THREE.WorkerLoader.Validator.verifyInput( onMaterials, this.callbacks.parse.onMaterials );
		return this;
	},

	/**
	 *
	 * @param {Function} onProgress
	 * @param {Function} onError
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	updateCallbacksFileLoading: function ( onProgress, onError ) {
		this.callbacks.load.onProgress = onProgress;
		this.callbacks.load.onError = onError;
		return this;
	},

	/**
	 *
	 * @param {Function} onComplete
	 * @param {Function} onCompleteLoad
	 * @param {Function} onCompleteParse
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	updateCallbacksPipeline: function ( onComplete, onCompleteFileLoading, onCompleteParsing ) {
		this.callbacks.pipeline.onComplete = THREE.WorkerLoader.Validator.verifyInput( onComplete, this.callbacks.pipeline.onComplete );
		this.callbacks.pipeline.onCompleteFileLoading = THREE.WorkerLoader.Validator.verifyInput( onCompleteFileLoading, this.callbacks.pipeline.onCompleteFileLoading );
		this.callbacks.pipeline.onCompleteParsing = THREE.WorkerLoader.Validator.verifyInput( onCompleteParsing, this.callbacks.pipeline.onCompleteParsing );
		return this;
	},

	/**
	 *
	 * @param {Function} onReport
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	updateCallbacksApp: function ( onReport ) {
		this.callbacks.app.onReport = THREE.WorkerLoader.Validator.verifyInput( onReport, this.callbacks.app.onReport );
		return this;
	},

	/**
	 * @param {THREE.WorkerLoader.LoadingTaskConfig} loadingTaskConfig
	 * @param {THREE.WorkerLoader.WorkerSupport} [workerSupport]
	 *
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	execute: function ( loadingTaskConfig, workerSupport ) {
		this._applyConfig( loadingTaskConfig );
		if ( THREE.WorkerLoader.Validator.isValid( workerSupport ) && workerSupport instanceof THREE.WorkerLoader.WorkerSupport ) {

			this.workerSupport = workerSupport;

		} else {

			this.workerSupport = new THREE.WorkerLoader.WorkerSupport();
			this.workerSupport.setLogging( this.logging.enabled, this.logging.debug );
			this.workerSupport.setTerminateRequested( this.terminateWorkerOnLoad );
			this.workerSupport.setForceWorkerDataCopy( this.forceWorkerDataCopy );

		}
		this.meshBuilder = new THREE.OBJLoader.MeshBuilder();
		this.meshBuilder.setLogging( this.logging.enabled, this.logging.debug );

		var scope = this;
		var callbackMeshBuilderProgress = function ( type, text, numericalValue ) {
			var content = THREE.WorkerLoader.Validator.isValid( text ) ? text : '';
			var event = {
				detail: {
					type: type,
					modelName: scope.description,
					instanceNo: scope.instanceNo,
					text: content,
					numericalValue: numericalValue
				}
			};
			if ( THREE.WorkerLoader.Validator.isValid( scope.callbacks.app.onReport ) ) scope.callbacks.app.onReport( event );
			if ( scope.logging.enabled && scope.logging.debug ) console.debug( content );
		};
		this.meshBuilder._setCallbacks( callbackMeshBuilderProgress, this.callbacks.parse.onMesh, this.callbacks.parse.onMaterials );

		this._executeFileLoadingStep( 0 );
		return this;
	},


	/**
	 *
	 * @param {THREE.WorkerLoader.LoadingTaskConfig} loadingTaskConfig
	 *
	 * @returns {THREE.WorkerLoader.LoadingTask}
	 */
	_applyConfig: function ( loadingTaskConfig ) {
		loadingTaskConfig = THREE.WorkerLoader.Validator.verifyInput( loadingTaskConfig, null );

		var ownConfig = {};
		if ( THREE.WorkerLoader.Validator.isValid( loadingTaskConfig ) && loadingTaskConfig instanceof THREE.WorkerLoader.LoadingTaskConfig ) {

			ownConfig = loadingTaskConfig.config;
			var classDef = loadingTaskConfig.loader.classDef;
			if ( THREE.WorkerLoader.Validator.isValid( classDef ) ) {

				var loader = Object.create( classDef.prototype );
				classDef.call( loader );
				this.setLoader( loader, loadingTaskConfig.loader.config );
			}

		}
		if ( ! THREE.WorkerLoader.Validator.isValid( this.loader.ref ) ) throw 'Unable to continue. You have not specified a loader!';
		if ( typeof this.loader.ref.buildWorkerCode !== 'function' ) {

			throw this.loader.ref.modelName + ' has no function "buildWorkerCode".';

		}
		THREE.WorkerLoader.LoadingTask.applyConfiguration( this, ownConfig );
		if ( ! THREE.WorkerLoader.Validator.isValid( this.loader.ref ) ) {

			if ( this.logging.enabled ) console.warn( "Provided loader is not valid" );

		} else {

			// this will ensure that any base configuration on LoadingTask and Loader are aligned
			THREE.WorkerLoader.LoadingTask.applyConfiguration( this.loader.ref, ownConfig );
			THREE.WorkerLoader.LoadingTask.applyConfiguration( this.loader.ref, this.loader.config );

		}
		if ( loadingTaskConfig !== null ) {

			this.resetResourceDescriptors( loadingTaskConfig.resourceDescriptors );
			this.updateCallbacksApp(
				loadingTaskConfig.callbacks.app.onReport
			).updateCallbacksParsing(
				loadingTaskConfig.callbacks.parse.onMesh,
				loadingTaskConfig.callbacks.parse.onMaterials
			).updateCallbacksFileLoading(
				loadingTaskConfig.callbacks.load.onProgress,
				loadingTaskConfig.callbacks.load.onError
			).updateCallbacksPipeline(
				loadingTaskConfig.callbacks.pipeline.onComplete,
				loadingTaskConfig.callbacks.pipeline.onCompleteFileLoading,
				loadingTaskConfig.callbacks.pipeline.onCompleteParsing
			);
		}

		return this;
	},

	/**
	 *
	 * @param index
	 * @private
	 */
	_executeFileLoadingStep: function ( index ) {
		var loadingTask = this;
		if ( index === loadingTask.resourceDescriptors.length ) {

			loadingTask._executeParsingStep( 0 );
			return;

		}
		var resourceDescriptorCurrent = loadingTask.resourceDescriptors[ index ];
		if ( resourceDescriptorCurrent.resourceType === 'URL' ) {

			if ( ! THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.load.onProgress ) ) {
				var numericalValueRef = 0;
				var numericalValue = 0;
				loadingTask.callbacks.load.onProgress = function ( event ) {
					if ( ! event.lengthComputable ) return;

					numericalValue = event.loaded / event.total;
					if ( numericalValue > numericalValueRef ) {

						numericalValueRef = numericalValue;
						var url = ( resourceDescriptorCurrent === null ) ? '' : resourceDescriptorCurrent.url;
						var output = 'Download of "' + url + '": ' + ( numericalValue * 100 ).toFixed( 2 ) + '%';
						if ( THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.app.onReport ) ) {

							loadingTask.callbacks.app.onReport( {
								detail: {
									type: 'progressLoad',
									text: output,
									instanceNo: loadingTask.instanceNo,
									numericalValue: numericalValue

								}
							} );

						}
					}
				};
			}
			if ( ! THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.load.onError ) ) {
				loadingTask.callbacks.load.onError = function ( event ) {
					var url = ( resourceDescriptorCurrent === null ) ? '' : resourceDescriptorCurrent.url;
					var output = 'Error occurred while downloading "' + url + '"';
					console.error( output + ': ' + event );
					if ( THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.app.onReport ) ) {

						loadingTask.callbacks.app.onReport( {
							detail: {
								type: 'error',
								text: output,
								instanceNo: loadingTask.instanceNo,
								numericalValue: - 1

							}
						} );
					}
				};
			}

			var processResourcesProxy = function ( content ) {
				loadingTask.resourceDescriptors[ index ].content = content;
				index ++;
				if ( THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.pipeline.onCompleteFileLoading ) ) {

					loadingTask.callbacks.pipeline.onCompleteFileLoading( content );

				}
				loadingTask._executeFileLoadingStep( index );
			};

			var fileLoader = new THREE.FileLoader( loadingTask.manager );
			fileLoader.setResponseType( resourceDescriptorCurrent.parserConfiguration.payloadType );
			fileLoader.setPath( loadingTask.loader.ref.path );
			fileLoader.load( resourceDescriptorCurrent.url, processResourcesProxy, loadingTask.callbacks.load.onProgress, loadingTask.callbacks.load.onError );

		} else {

			index++;
			loadingTask._executeFileLoadingStep( index );

		}
	},

	/**
	 *
	 * @private
	 */
	_executeParsingStep: function ( index ) {
		var loadingTask = this;
		if ( index === loadingTask.resourceDescriptors.length ) {

			loadingTask._finalizeParsing();
			return;

		}
		var resourceDescriptorCurrent = loadingTask.resourceDescriptors[ index ];
		var result;
		var useAsync = resourceDescriptorCurrent.useAsync && ! loadingTask.enforceSync;
		if ( useAsync ) {

			var scopedOnLoad = function ( measureTime ) {
				measureTime = THREE.WorkerLoader.Validator.verifyInput( measureTime, true );
				if ( measureTime && loadingTask.logging.enabled ) console.timeEnd( 'WorkerLoader parse [' + loadingTask.instanceNo + '] : ' + resourceDescriptorCurrent.name );

				result = loadingTask.baseObject3d;
				resourceDescriptorCurrent.setParserResult( result );
				var callbackOnProcessResult = resourceDescriptorCurrent.getCallbackOnProcessResult();
				if ( THREE.WorkerLoader.Validator.isValid( callbackOnProcessResult ) ) callbackOnProcessResult( resourceDescriptorCurrent );
				if ( THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.pipeline.onCompleteParsing ) ) {

					loadingTask.callbacks.pipeline.onCompleteParsing( {
						detail: {
							extension: resourceDescriptorCurrent.extension,
							result: resourceDescriptorCurrent.result,
							modelName: resourceDescriptorCurrent.name,
							instanceNo: loadingTask.instanceNo
						}
					} );

				}
				index++;
				loadingTask._executeParsingStep( index );
			};

			var scopedOnMesh = function ( content ) {
				loadingTask.meshBuilder.processPayload( content );
			};
			loadingTask._parseAsync( resourceDescriptorCurrent, scopedOnLoad, scopedOnMesh );

		} else {

			result = loadingTask.loader.ref.parse( resourceDescriptorCurrent.content, resourceDescriptorCurrent.parserConfiguration );
			resourceDescriptorCurrent.setParserResult( result );
			var callbackOnProcessResult = resourceDescriptorCurrent.getCallbackOnProcessResult();
			if ( THREE.WorkerLoader.Validator.isValid( callbackOnProcessResult ) ) callbackOnProcessResult( resourceDescriptorCurrent );
			if ( THREE.WorkerLoader.Validator.isValid( loadingTask.callbacks.pipeline.onCompleteParsing ) ) {

				loadingTask.callbacks.pipeline.onCompleteParsing( {
					detail: {
						extension: resourceDescriptorCurrent.extension,
						result: result,
						modelName: resourceDescriptorCurrent.name,
						instanceNo: loadingTask.instanceNo
					}
				} );

			}
			index++;
			loadingTask._executeParsingStep( index );

		}
	},

	/**
	 *
	 * @param {THREE.WorkerLoader.LoadingTask} loadingTask
	 * @private
	 */
	_parseAsync: function ( resourceDescriptor, scopedOnLoad, scopedOnMesh ) {
		if ( ! THREE.WorkerLoader.Validator.isValid( this.loader.ref ) ) {

			throw 'Unable to run "executeWithOverride" without proper "loader"!';

		}
		var ltModelName = this.loader.ref.modelName;
		if ( ltModelName !== undefined && ltModelName !== null && ltModelName.length > 0 ) resourceDescriptor.name = this.loader.ref.modelName;

		// fast-fail in case of illegal data
		if ( ! THREE.WorkerLoader.Validator.isValid( resourceDescriptor.content ) ) {

			console.warn( 'Provided content is not a valid ArrayBuffer.' );
			scopedOnLoad( false );

		}
		if ( this.logging.enabled ) console.time( 'WorkerLoader parse [' + this.instanceNo + '] : ' + resourceDescriptor.name );

		this.meshBuilder.setBaseObject3d( this.baseObject3d );
		this.meshBuilder.createDefaultMaterials();
		if ( THREE.WorkerLoader.Validator.isValid( this.loader.ref.meshBuilder ) && this.loader.ref.meshBuilder instanceof THREE.OBJLoader.MeshBuilder ) {

			this.meshBuilder.setMaterials( this.loader.ref.meshBuilder.getMaterials() );

		}
		this.workerSupport.validate( this.loader.ref );
		this.workerSupport.setCallbacks( scopedOnMesh, scopedOnLoad );

		var materialsContainer = {
			materials: {},
			serializedMaterials: {}
		};
		if ( this.sendMaterials ) {

			var materials = this.meshBuilder.getMaterials();
			for ( var materialName in materials ) materialsContainer.materials[ materialName ] = materialName;
			if ( this.sendMaterialsJson ) materialsContainer.serializedMaterials = this.meshBuilder.getMaterialsJSON();

		}
		var params = ( THREE.WorkerLoader.Validator.isValid( resourceDescriptor.parserConfiguration ) ) ? resourceDescriptor.parserConfiguration : {};
		// enforce async param
		params.useAsync = true;

		this.workerSupport.run(
			{
				// this is only applicable to OBJLoader
				// materialPerSmoothingGroup: this.materialPerSmoothingGroup,
				// useIndices: this.useIndices,
				// disregardNormals: this.disregardNormals
				params: params,
				logging: {
					enabled: this.logging.enabled,
					debug: this.logging.debug
				},
				materials: materialsContainer,
				data: {
					input: resourceDescriptor.content,
					options: null
				}
			}
		)
	},

	_finalizeParsing: function () {
		var resourceDescriptorCurrent = this.resourceDescriptors[ this.resourceDescriptors.length - 1 ];
		if ( resourceDescriptorCurrent.useAsync ) {

			if ( THREE.WorkerLoader.Validator.isValid( this.callbacks.pipeline.onComplete ) ) {

				this.callbacks.pipeline.onComplete( {
					detail: {
						extension: resourceDescriptorCurrent.extension,
						result: resourceDescriptorCurrent.result,
						modelName: resourceDescriptorCurrent.name,
						instanceNo: this.instanceNo
					}
				} );
			}

		} else {

			if ( THREE.WorkerLoader.Validator.isValid( this.callbacks.pipeline.onComplete ) ) this.callbacks.pipeline.onComplete( this.baseObject3d );

		}
	}
};


/**
 * Encapsulates the configuration for a complete {@link THREE.WorkerLoader.LoadingTask}.
 * @constructor
 */
THREE.WorkerLoader.LoadingTaskConfig = function ( loadingTaskConfig ) {
	this.loader = {
		classDef: '',
		config: {}
	};
	this.config = THREE.WorkerLoader.Validator.verifyInput( loadingTaskConfig, {} );
	this.resourceDescriptors = [];

	this.callbacks = {
		app: {
			onReport: null
		},
		parse: {
			onMesh: null,
			onMaterials: null
		},
		load: {
			onProgress: null,
			onError: null
		},
		pipeline: {
			onComplete: null,
			onCompleteFileLoading: null,
			onCompleteParsing: null
		}
	};
};

THREE.WorkerLoader.LoadingTaskConfig.prototype = {

	constructor: THREE.WorkerLoader.LoadingTaskConfig,

	/**
	 *
	 * @param {String} loaderClassDef
	 * @param {Object} [loaderConfig]
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	setLoaderConfig: function ( loaderClassDef, loaderConfig ) {
		this.loader.classDef = THREE.WorkerLoader.Validator.verifyInput( loaderClassDef, this.loader.classDef );
		this.loader.config = THREE.WorkerLoader.Validator.verifyInput( loaderConfig, this.loader.config );
		return this;
	},

	/**
	 *
	 * @param {THREE.WorkerLoader.ResourceDescriptor} resourceDescriptor
	 */
	addResourceDescriptor: function ( resourceDescriptor ) {
		this.resourceDescriptors.push( resourceDescriptor );
		return this;
	},

	/**
	 *
	 * @param resourceDescriptor
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	addResourceDescriptors: function ( resourceDescriptors ) {
		for ( var name in resourceDescriptors ) this.resourceDescriptors.push( resourceDescriptors[ name ] );
		return this;
	},

	/**
	 * Sets the callbacks used during file loading.
	 * @param {Function} onProgress
	 * @param {Function} [onError]
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	setCallbacksFileLoading: function ( onProgress, onError ) {
		this.callbacks.load.onProgress = THREE.WorkerLoader.Validator.verifyInput( onProgress, this.callbacks.load.onProgress );
		this.callbacks.load.onError = THREE.WorkerLoader.Validator.verifyInput( onError, this.callbacks.load.onError );
		return this;
	},

	/**
	 * Sets the callbacks used during parsing and for general reporting to the application context.
	 * @param {Function} [onMesh]
	 * @param {Function} [onMaterials]
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	setCallbacksParsing: function ( onMesh, onMaterials ) {
		this.callbacks.parse.onMesh = THREE.WorkerLoader.Validator.verifyInput( onMesh, this.callbacks.parse.onMesh );
		this.callbacks.parse.onMaterials = THREE.WorkerLoader.Validator.verifyInput( onMaterials, this.callbacks.parse.onMaterials );
		return this;
	},

	/**
	 *
	 * @param {Function} onComplete
	 * @param {Function} onCompleteLoad
	 * @param {Function} onCompleteParse
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	setCallbacksPipeline: function ( onComplete, onCompleteFileLoading, onCompleteParsing ) {
		this.callbacks.pipeline.onComplete = THREE.WorkerLoader.Validator.verifyInput( onComplete, this.callbacks.pipeline.onComplete );
		this.callbacks.pipeline.onCompleteFileLoading = THREE.WorkerLoader.Validator.verifyInput( onCompleteFileLoading, this.callbacks.pipeline.onCompleteFileLoading );
		this.callbacks.pipeline.onCompleteParsing = THREE.WorkerLoader.Validator.verifyInput( onCompleteParsing, this.callbacks.pipeline.onCompleteParsing );
		return this;
	},

	/**
	 *
	 * @param {Function} onReport
	 * @returns {THREE.WorkerLoader.LoadingTaskConfig}
	 */
	setCallbacksApp: function ( onReport ) {
		this.callbacks.app.onReport = THREE.WorkerLoader.Validator.verifyInput( onReport, this.callbacks.app.onReport );
		return this;
	}
};

/**
 *
 * @param {String} resourceType
 * @param {String} name
 * @param {Object} content
 * @constructor
 */
THREE.WorkerLoader.ResourceDescriptor = function ( resourceType, name, content ) {
	this.name = ( name !== undefined && name !== null ) ? name : 'Unnamed_Resource';
	this.resourceType = resourceType;
	this.content = ( content !== undefined && content !== null ) ? content : null;
	this.url = null;
	this.filename = null;
	this.path = '';
	this.extension = null;
	this.useAsync = true;
	this.parserConfiguration = {
		payloadType: 'arraybuffer'
	};
	this.result = null;

	this._init();
};

THREE.WorkerLoader.ResourceDescriptor.prototype = {

	constructor: THREE.WorkerLoader.ResourceDescriptor,

	_init: function () {

		if ( this.resourceType === 'Buffer' ) {

			if ( ! ( this.content instanceof ArrayBuffer ||
				this.content instanceof Int8Array ||
				this.content instanceof Uint8Array ||
				this.content instanceof Uint8ClampedArray ||
				this.content instanceof Int16Array ||
				this.content instanceof Uint16Array ||
				this.content instanceof Int32Array ||
				this.content instanceof Uint32Array ||
				this.content instanceof Float32Array ||
				this.content instanceof Float64Array ) ) {

				throw 'Provided content is neither an "ArrayBuffer" nor a "TypedArray"! Aborting...';

			}
			this.parserConfiguration.payloadType = 'arraybuffer';

		} else if ( this.resourceType === 'String' ) {

			if ( ! ( typeof( this.content ) === 'string' || this.content instanceof String ) ) throw 'Provided content is not of resourceType "String"! Aborting...';
			this.parserConfiguration.payloadType = 'text';

		} else if ( this.resourceType === 'URL' ) {

			this.url = this.content;
			this.filename = this.url;
			var urlParts = this.url.split( '/' );
			if ( urlParts.length > 2 ) {

				this.filename = urlParts[ urlParts.length - 1 ];
				var urlPartsPath = urlParts.slice( 0, urlParts.length - 1).join( '/' ) + '/';
				if ( urlPartsPath !== undefined && urlPartsPath !== null ) this.path = urlPartsPath;

			}
			var filenameParts = this.filename.split( '.' );
			if ( filenameParts.length > 1 ) this.extension = filenameParts[ filenameParts.length - 1 ];

		} else if ( this.resourceType === 'Metadata' ) {

			this.content = 'no_content';

		} else {

			throw 'An unsupported resourceType "' + this.resourceType + '" was provided! Aborting...'

		}
	},

	setUseAsync: function ( useAsync ) {
		this.useAsync = useAsync === true;
		return this;
	},

	setParserConfiguration: function ( parserConfiguration ) {
		THREE.WorkerLoader.LoadingTask.applyConfiguration( this.parserConfiguration, parserConfiguration, true );
		if ( this.parserConfiguration.name === undefined || this.parserConfiguration.name === null ) this.parserConfiguration.name = this.name;
		return this;
	},

	setParserResult: function ( result ) {
		this.result = result;
	},

	setCallbackOnProcessResult: function ( callbackOnProcessResult ) {
		this.callbackOnProcessResult = callbackOnProcessResult;
		return this;
	},

	getCallbackOnProcessResult: function ( ) {
		return this.callbackOnProcessResult;
	}
};


THREE.WorkerLoader.Validator = {

	/**
	 * If given input is null or undefined, false is returned otherwise true.
	 *
	 * @param input Can be anything
	 * @returns {boolean}
	 */
	isValid: function( input ) {
		return ( input !== null && input !== undefined );
	},

	/**
	 * If given input is null or undefined, the defaultValue is returned otherwise the given input.
	 *
	 * @param input Can be anything
	 * @param defaultValue Can be anything
	 * @returns {*}
	 */
	verifyInput: function( input, defaultValue ) {
		return ( input === null || input === undefined ) ? defaultValue : input;
	}
};


/**
 * This class provides means to transform existing parser code into a web worker. It defines a simple communication protocol
 * which allows to configure the worker and receive raw mesh data during execution.
 * @class
 */
THREE.WorkerLoader.WorkerSupport = function () {
	console.info( 'Using THREE.WorkerLoader.WorkerSupport version: ' + THREE.WorkerLoader.WorkerSupport.WORKER_SUPPORT_VERSION );

	// check worker support first
	if ( window.Worker === undefined ) throw "This browser does not support web workers!";
	if ( window.Blob === undefined ) throw "This browser does not support Blob!";
	if ( typeof window.URL.createObjectURL !== 'function' ) throw "This browser does not support Object creation from URL!";

	this._reset();
};

THREE.WorkerLoader.WorkerSupport.prototype = {

	constructor: THREE.WorkerLoader.WorkerSupport,

	_reset: function () {
		this.logging = {
			enabled: true,
			debug: false
		};

		var scope = this;
		var scopeTerminate = function (  ) {
			scope._terminate();
		};
		this.worker = {
			native: null,
			logging: true,
			workerRunner: {
				haveUserImpl: false,
				name: 'THREE.WorkerLoader.WorkerSupport._WorkerRunnerRefImpl',
				impl: THREE.WorkerLoader.WorkerSupport._WorkerRunnerRefImpl
			},
			terminateRequested: false,
			forceWorkerDataCopy: false,
			started: false,
			queuedMessage: null,
			callbacks: {
				meshBuilder: null,
				onLoad: null,
				terminate: scopeTerminate
			}
		};
	},

	/**
	 * Enable or disable logging in general (except warn and error), plus enable or disable debug logging.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {boolean} enabled True or false.
	 * @param {boolean} debug True or false.
	 */
	setLogging: function ( enabled, debug ) {
		this.logging.enabled = enabled === true;
		this.logging.debug = debug === true;
		this.worker.logging = enabled === true;
		return this;
	},

	/**
	 * Forces all ArrayBuffers to be transferred to worker to be copied.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {boolean} forceWorkerDataCopy True or false.
	 */
	setForceWorkerDataCopy: function ( forceWorkerDataCopy ) {
		this.worker.forceWorkerDataCopy = forceWorkerDataCopy === true;
		return this;
	},

	/**
	 * Specify functions that should be build when new raw mesh data becomes available and when the parser is finished.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {Function} meshBuilder The mesh builder function. Default is {@link THREE.WorkerLoader.MeshBuilder}.
	 * @param {Function} onLoad The function that is called when parsing is complete.
	 */
	setCallbacks: function ( meshBuilder, onLoad ) {
		this.worker.callbacks.meshBuilder = THREE.WorkerLoader.Validator.verifyInput( meshBuilder, this.worker.callbacks.meshBuilder );
		this.worker.callbacks.onLoad = THREE.WorkerLoader.Validator.verifyInput( onLoad, this.worker.callbacks.onLoad );
		return this;
	},

	/**
	 * Request termination of worker once parser is finished.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {boolean} terminateRequested True or false.
	 */
	setTerminateRequested: function ( terminateRequested ) {
		this.worker.terminateRequested = terminateRequested === true;
		if ( this.worker.terminateRequested && THREE.WorkerLoader.Validator.isValid( this.worker.native ) &&
				! THREE.WorkerLoader.Validator.isValid( this.worker.queuedMessage ) && this.worker.started ) {

			if ( this.logging.enabled ) console.info( 'Worker is terminated immediately as it is not running!' );
			this._terminate();

		}
		return this;
	},

	/**
	 * Set a user-defined runner embedding the worker code and  handling communication and execution with main.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param userRunnerImpl The object reference
	 * @param userRunnerImplName The name of the object
	 */
	setUserRunnerImpl: function ( userRunnerImpl, userRunnerImplName ) {
		if ( THREE.WorkerLoader.Validator.isValid( userRunnerImpl ) && THREE.WorkerLoader.Validator.isValid( userRunnerImplName ) ) {

			this.worker.workerRunner.haveUserImpl = true;
			this.worker.workerRunner.impl = userRunnerImpl;
			this.worker.workerRunner.name = userRunnerImplName;
			if ( this.logging.enabled ) console.info( 'WorkerSupport: Using "' + userRunnerImplName + '" as Runner class for worker.' );

		}
		return this;
	},

	/**
	 * Validate the status of worker code and the derived worker.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {Object} loader The loader that shall be used to create the parser code.
	 */
	validate: function ( loader ) {
		if ( THREE.WorkerLoader.Validator.isValid( this.worker.native ) ) return;
		if ( this.logging.enabled ) {

			console.info( 'WorkerSupport: Building worker code...' );
			console.time( 'buildWebWorkerCode' );
			if ( ! this.worker.workerRunner.haveUserImpl ) console.info( 'WorkerSupport: Using DEFAULT "' + this.worker.workerRunner.name + '" as Runner class for worker.' );

		}
		var codeBuilderInstructions = loader.buildWorkerCode( THREE.WorkerLoader.WorkerSupport.CodeSerializer );
		var userWorkerCode = codeBuilderInstructions.code;
		userWorkerCode += 'THREE.WorkerLoader = {\n\tWorkerSupport: {},\n\tParser: ' + codeBuilderInstructions.parserName + '\n};\n\n';
		userWorkerCode += THREE.WorkerLoader.WorkerSupport.CodeSerializer.serializeClass( this.worker.workerRunner.name, this.worker.workerRunner.impl );
		userWorkerCode += 'new ' + this.worker.workerRunner.name + '();\n\n';

		var scope = this;
		var scopedReceiveWorkerMessage = function ( event ) {
			scope._receiveWorkerMessage( event );
		};
		var initWorker = function ( stringifiedCode ) {
			var blob = new Blob( [ stringifiedCode ], { type: 'application/javascript' } );
			scope.worker.native = new Worker( window.URL.createObjectURL( blob ) );
			scope.worker.native.onmessage = scopedReceiveWorkerMessage;

			// process stored queuedMessage
			scope._postMessage();
		};

		if ( THREE.WorkerLoader.Validator.isValid( codeBuilderInstructions.libs ) &&
				THREE.WorkerLoader.Validator.isValid( codeBuilderInstructions.libs.locations ) &&
				codeBuilderInstructions.libs.locations.length > 0 ) {

			var libsContent = '';
			var loadAllLibraries = function ( path, locations ) {
				if ( locations.length === 0 ) {

					initWorker( libsContent + '\n\n' + userWorkerCode );
					if ( scope.logging.enabled ) console.timeEnd( 'buildWebWorkerCode' );

				} else {

					var loadedLib = function ( contentAsString ) {
						libsContent += contentAsString;
						loadAllLibraries( path, locations );
					};

					var fileLoader = new THREE.FileLoader();
					fileLoader.setPath( path );
					fileLoader.setResponseType( 'text' );
					fileLoader.load( locations[ 0 ], loadedLib );
					locations.shift();

				}
			};
			codeBuilderInstructions.libs.path = THREE.WorkerLoader.Validator.verifyInput( codeBuilderInstructions.libs.path, '' );
			loadAllLibraries( codeBuilderInstructions.libs.path, codeBuilderInstructions.libs.locations );

		} else {

			initWorker( userWorkerCode );
			if ( this.logging.enabled ) console.timeEnd( 'buildWebWorkerCode' );

		}
	},

	/**
	 * Executed in worker scope
	 */
	_receiveWorkerMessage: function ( event ) {
		var payload = event.data;
		switch ( payload.cmd ) {
			case 'meshData':
			case 'materialData':
			case 'imageData':
				this.worker.callbacks.meshBuilder( payload );
				break;

			case 'complete':
				this.worker.queuedMessage = null;
				this.worker.started = false;
				this.worker.callbacks.onLoad( payload.msg );

				if ( this.worker.terminateRequested ) {

					if ( this.worker.logging.enabled ) console.info( 'WorkerSupport [' + this.worker.workerRunner.name + ']: Run is complete. Terminating application on request!' );
					this.worker.callbacks.terminate();

				}
				break;

			case 'error':
				console.error( 'WorkerSupport [' + this.worker.workerRunner.namee + ']: Reported error: ' + payload.msg );
				this.worker.queuedMessage = null;
				this.worker.started = false;
				this.worker.callbacks.onLoad( payload.msg );

				if ( this.worker.terminateRequested ) {

					if ( this.worker.logging.enabled ) console.info( 'WorkerSupport [' + this.worker.workerRunner.name + ']: Run reported error. Terminating application on request!' );
					this.worker.callbacks.terminate();

				}
				break;

			default:
				console.error( 'WorkerSupport [' + this.worker.workerRunner.name + ']: Received unknown command: ' + payload.cmd );
				break;

		}
	},

	/**
	 * Runs the parser with the provided configuration.
	 * @memberOf THREE.WorkerLoader.WorkerSupport
	 *
	 * @param {Object} payload Raw mesh description (buffers, params, materials) used to build one to many meshes.
	 */
	run: function( payload ) {
		if ( THREE.WorkerLoader.Validator.isValid( this.worker.queuedMessage ) ) {

			console.warn( 'Already processing message. Rejecting new run instruction' );
			return;

		} else {

			this.worker.queuedMessage = payload;
			this.worker.started = true;

		}
		if ( ! THREE.WorkerLoader.Validator.isValid( this.worker.callbacks.meshBuilder ) ) throw 'Unable to run as no "MeshBuilder" callback is set.';
		if ( ! THREE.WorkerLoader.Validator.isValid( this.worker.callbacks.onLoad ) ) throw 'Unable to run as no "onLoad" callback is set.';
		if ( payload.cmd !== 'run' ) payload.cmd = 'run';
		if ( THREE.WorkerLoader.Validator.isValid( payload.logging ) ) {

			payload.logging.enabled = payload.logging.enabled === true;
			payload.logging.debug = payload.logging.debug === true;

		} else {

			payload.logging = {
				enabled: true,
				debug: false
			}

		}
		this._postMessage();
	},

	_postMessage: function () {
		if ( THREE.WorkerLoader.Validator.isValid( this.worker.queuedMessage ) && THREE.WorkerLoader.Validator.isValid( this.worker.native ) ) {

			if ( this.worker.queuedMessage.data.input instanceof ArrayBuffer ) {

				var content;
				if ( this.worker.forceWorkerDataCopy ) {

					content = this.worker.queuedMessage.data.input.slice( 0 );

				} else {

					content = this.worker.queuedMessage.data.input;

				}
				this.worker.native.postMessage( this.worker.queuedMessage, [ content ] );

			} else {

				this.worker.native.postMessage( this.worker.queuedMessage );

			}

		}
	},

	_terminate: function () {
		this.worker.native.terminate();
		this._reset();
	}
};
THREE.WorkerLoader.WorkerSupport.WORKER_SUPPORT_VERSION = '3.0.0-dev';


THREE.WorkerLoader.WorkerSupport.CodeSerializer = {

	/**
	 *
	 * @param fullName
	 * @param object
	 * @returns {string}
	 */
	serializeObject: function ( fullName, object ) {
		var objectString = fullName + ' = {\n';
		var part;
		for ( var name in object ) {

			part = object[ name ];
			if ( typeof( part ) === 'string' || part instanceof String ) {

				part = part.replace( '\n', '\\n' );
				part = part.replace( '\r', '\\r' );
				objectString += '\t' + name + ': "' + part + '",\n';

			} else if ( part instanceof Array ) {

				objectString += '\t' + name + ': [' + part + '],\n';

			} else if ( Number.isInteger( part ) ) {

				objectString += '\t' + name + ': ' + part + ',\n';

			} else if ( typeof part === 'function' ) {

				objectString += '\t' + name + ': ' + part + ',\n';

			}

		}
		objectString += '}\n\n';

		return objectString;
	},

	/**
	 *
	 * @param fullName
	 * @param object
	 * @param basePrototypeName
	 * @param ignoreFunctions
	 * @returns {string}
	 */
	serializeClass: function ( fullName, object, basePrototypeName, ignoreFunctions ) {
		var funcString, objectPart, constructorString;
		var prototypeFunctions = '';

		if ( ! Array.isArray( ignoreFunctions ) ) ignoreFunctions = [];

		for ( var name in object.prototype ) {

			objectPart = object.prototype[ name ];
			if ( name === 'constructor' ) {

				funcString = objectPart.toString();
				constructorString = fullName + ' = ' + funcString + ';\n\n';

			} else if ( typeof objectPart === 'function' ) {

				if ( ignoreFunctions.indexOf( name ) < 0 ) {

					funcString = objectPart.toString();
					prototypeFunctions += '\t' + name + ': ' + funcString + ',\n\n';

				}

			}

		}

		var objectString = constructorString;
		objectString += fullName + '.prototype = {\n\n';
		objectString += '\tconstructor: ' + fullName + ',\n\n';
		objectString += prototypeFunctions;
		objectString += '\n};\n\n';

		if ( basePrototypeName !== null && basePrototypeName !== undefined ) {

			objectString += '\n';
			objectString += fullName + '.prototype = Object.create( ' + basePrototypeName + '.prototype );\n';
			objectString += fullName + '.constructor = ' + fullName + ';\n';
			objectString += '\n';
		}

		return objectString;
	},

	serializeSingleton: function ( fullName, object, internalName, basePrototypeName, ignoreFunctions ) {
		var objectName = ( THREE.WorkerLoader.Validator.isValid( internalName ) ) ? internalName : object.name;

		var objectString = fullName + ' = (function () {\n\n';
		var inheritanceBlock = '\n';
		if ( THREE.WorkerLoader.Validator.isValid( basePrototypeName ) ) {

			inheritanceBlock += '\t' + objectName + '.prototype = Object.create( ' + basePrototypeName + '.prototype );\n';
			inheritanceBlock += '\t' + objectName + '.constructor = ' + objectName + ';\n\n';

		}
		objectString += inheritanceBlock;
		objectString += '\t' + object.prototype.constructor.toString() + '\n\n';

		var funcString, objectPart;
		ignoreFunctions = THREE.WorkerLoader.Validator.verifyInput( ignoreFunctions, [] );
		for ( var name in object.prototype ) {

			objectPart = object.prototype[ name ];
			if ( typeof objectPart === 'function' && ignoreFunctions.indexOf( name ) < 0 ) {

				funcString = objectPart.toString();
				objectString += '\t' + objectName + '.prototype.' + name + ' = ' + funcString + ';\n\n';

			}

		}
		objectString += '\treturn ' + objectName + ';\n';
		objectString += '})();\n\n';

		return objectString;
	}
};


/**
 * Default implementation of the WorkerRunner responsible for creation and configuration of the parser within the worker.
 * @constructor
 */
THREE.WorkerLoader.WorkerSupport._WorkerRunnerRefImpl = function () {
	var scope = this;
	var scopedRunner = function( event ) {
		scope.processMessage( event.data );
	};
	self.addEventListener( 'message', scopedRunner, false );
};

THREE.WorkerLoader.WorkerSupport._WorkerRunnerRefImpl.prototype = {

	constructor: THREE.WorkerLoader.WorkerSupport._WorkerRunnerRefImpl,

	/**
	 * Applies values from parameter object via set functions or via direct assignment.
	 * @memberOf THREE.WorkerLoader.WorkerRunnerRefImpl
	 *
	 * @param {Object} parser The parser instance
	 * @param {Object} params The parameter object
	 */
	applyProperties: function ( parser, params ) {
		var property, funcName, values;
		for ( property in params ) {
			funcName = 'set' + property.substring( 0, 1 ).toLocaleUpperCase() + property.substring( 1 );
			values = params[ property ];

			if ( typeof parser[ funcName ] === 'function' ) {

				parser[ funcName ]( values );

			} else if ( parser.hasOwnProperty( property ) ) {

				parser[ property ] = values;

			}
		}
	},

	/**
	 * Configures the Parser implementation according the supplied configuration object.
	 * @memberOf THREE.WorkerLoader.WorkerRunnerRefImpl
	 *
	 * @param {Object} payload Raw mesh description (buffers, params, materials) used to build one to many meshes.
	 */
	processMessage: function ( payload ) {
		if ( payload.cmd === 'run' ) {

			var callbacks = {
				callbackMeshBuilder: function ( payload ) {
					self.postMessage( payload );
				},
				callbackProgress: function ( text ) {
					if ( payload.logging.enabled && payload.logging.debug ) console.debug( 'WorkerRunner: progress: ' + text );
				}
			};

			// Parser is expected to be named as such
			var parser = new THREE.WorkerLoader.Parser();
			if ( typeof parser[ 'setLogging' ] === 'function' ) parser.setLogging( payload.logging.enabled, payload.logging.debug );
			this.applyProperties( parser, payload.params );
			this.applyProperties( parser, payload.materials );
			this.applyProperties( parser, callbacks );
			parser.workerScope = self;
			parser.parse( payload.data.input, payload.data.options );

			if ( payload.logging.enabled ) console.log( 'WorkerRunner: Run complete!' );

			callbacks.callbackMeshBuilder( {
				cmd: 'complete',
				msg: 'WorkerRunner completed run.'
			} );

		} else {

			console.error( 'WorkerRunner: Received unknown command: ' + payload.cmd );

		}
	}
};

/**
 * Orchestrate loading of multiple OBJ files/data from an instruction queue with a configurable amount of workers (1-16).
 * Workflow:
 *   prepareWorkers
 *   enqueueForRun
 *   processQueue
 *   deregister
 *
 * @class
 */
THREE.LoaderSupport.WorkerDirector = (function () {

	var LOADER_WORKER_DIRECTOR_VERSION = '1.0.0-dev';

	var Validator = THREE.LoaderSupport.Validator;

	var MAX_WEB_WORKER = 16;
	var MAX_QUEUE_SIZE = 8192;

	function WorkerDirector( classDef ) {
		console.log( "Using THREE.LoaderSupport.WorkerDirector version: " + LOADER_WORKER_DIRECTOR_VERSION );

		this.maxQueueSize = MAX_QUEUE_SIZE ;
		this.maxWebWorkers = MAX_WEB_WORKER;
		this.crossOrigin = null;

		if ( ! Validator.isValid( classDef ) ) throw 'Provided invalid classDef: ' + classDef;

		this.workerDescription = {
			classDef: classDef,
			globalCallbacks: {},
			workerSupports: []
		};
		this.objectsCompleted = 0;
		this.instructionQueue = [];
	}

	/**
	 * Returns the maximum length of the instruction queue.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 *
	 * @returns {number}
	 */
	WorkerDirector.prototype.getMaxQueueSize = function () {
		return this.maxQueueSize;
	};

	/**
	 * Returns the maximum number of workers.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 *
	 * @returns {number}
	 */
	WorkerDirector.prototype.getMaxWebWorkers = function () {
		return this.maxWebWorkers;
	};

	/**
	 * Sets the CORS string to be used.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 *
	 * @param {string} crossOrigin CORS value
	 */
	WorkerDirector.prototype.setCrossOrigin = function ( crossOrigin ) {
		this.crossOrigin = crossOrigin;
	};

	/**
	 * Create or destroy workers according limits. Set the name and register callbacks for dynamically created web workers.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 *
	 * @param {THREE.OBJLoader2.WWOBJLoader2.PrepDataCallbacks} globalCallbacks  Register global callbacks used by all web workers
	 * @param {number} maxQueueSize Set the maximum size of the instruction queue (1-1024)
	 * @param {number} maxWebWorkers Set the maximum amount of workers (1-16)
	 */
	WorkerDirector.prototype.prepareWorkers = function ( globalCallbacks, maxQueueSize, maxWebWorkers ) {
		if ( Validator.isValid( globalCallbacks ) ) this.workerDescription.globalCallbacks = globalCallbacks;
		this.maxQueueSize = Math.min( maxQueueSize, MAX_QUEUE_SIZE );
		this.maxWebWorkers = Math.min( maxWebWorkers, MAX_WEB_WORKER );
		this.objectsCompleted = 0;
		this.instructionQueue = [];

		var start = this.workerDescription.workerSupports.length;
		var i;
		if ( start < this.maxWebWorkers ) {

			for ( i = start; i < this.maxWebWorkers; i++ ) {

				this.workerDescription.workerSupports[ i ] = new THREE.LoaderSupport.WorkerSupport();

			}

		} else {

			for ( i = start - 1; i >= this.maxWebWorkers; i-- ) {

				this.workerDescription.workerSupports[ i ].setRequestTerminate( true );
				this.workerDescription.workerSupports.pop();

			}
		}
	};

	/**
	 * Store run instructions in internal instructionQueue.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 *
	 * @param {Object} prepData Either {@link THREE.LoaderSupport.PrepData}
	 */
	WorkerDirector.prototype.enqueueForRun = function ( prepData ) {
		if ( this.instructionQueue.length < this.maxQueueSize ) {
			this.instructionQueue.push( prepData );
		}
	};

	/**
	 * Process the instructionQueue until it is depleted.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 */
	WorkerDirector.prototype.processQueue = function () {
		if ( this.instructionQueue.length === 0 ) return;

		var length = Math.min( this.maxWebWorkers, this.instructionQueue.length );
		for ( var i = 0; i < length; i++ ) {

			this._kickWorkerRun( this.instructionQueue[ 0 ], i );
			this.instructionQueue.shift();

		}
	};

	WorkerDirector.prototype._kickWorkerRun = function( prepData, workerInstanceNo ) {
		var scope = this;
		var directorOnLoad = function ( sceneGraphBaseNode, modelName, instanceNo ) {
			scope.objectsCompleted++;

			var nextPrepData = scope.instructionQueue[ 0 ];
			if ( Validator.isValid( nextPrepData ) ) {

				scope.instructionQueue.shift();
				console.log( '\nAssigning next item from queue to worker (queue length: ' + scope.instructionQueue.length + ')\n\n' );
				scope._kickWorkerRun( nextPrepData, instanceNo );

			} else if ( scope.instructionQueue.length === 0 ) {

				scope.deregister();

			}
		};

		var prepDataCallbacks = prepData.getCallbacks();
		var globalCallbacks = this.workerDescription.globalCallbacks;
		var wrapperOnLoad = function ( sceneGraphBaseNode, modelName, instanceNo ) {
			if ( Validator.isValid( globalCallbacks.onLoad ) ) {

				globalCallbacks.onLoad( sceneGraphBaseNode, modelName, instanceNo );

			}

			if ( Validator.isValid( prepDataCallbacks.onLoad ) ) {

				prepDataCallbacks.onLoad( sceneGraphBaseNode, modelName, instanceNo );

			}
			directorOnLoad( sceneGraphBaseNode, modelName, instanceNo );
		};

		var wrapperOnProgress = function ( content, modelName, instanceNo ) {
			if ( Validator.isValid( globalCallbacks.onProgress ) ) {

				globalCallbacks.onProgress( content, modelName, instanceNo );
			}

			if ( Validator.isValid( prepDataCallbacks.onProgress ) ) {

				prepDataCallbacks.onProgress( content, modelName, instanceNo );

			}
		};

		var wrapperOnMeshAlter = function ( meshName, bufferGeometry, material ) {
			if ( Validator.isValid( globalCallbacks.onMeshAlter ) ) {

				globalCallbacks.onMeshAlter( meshName, bufferGeometry, material );
			}

			if ( Validator.isValid( prepDataCallbacks.onMeshAlter ) ) {

				prepDataCallbacks.onMeshAlter( meshName, bufferGeometry, material );

			}
		};

		var workerSupport = this.workerDescription.workerSupports[ workerInstanceNo ];
		var loaderRef = this._buildLoader( workerInstanceNo );
		loaderRef.workerSupport = workerSupport;

		var updatedCallbacks = new THREE.LoaderSupport.Callbacks();
		updatedCallbacks.setCallbackOnLoad( wrapperOnLoad );
		updatedCallbacks.setCallbackOnProgress( wrapperOnProgress );
		updatedCallbacks.setCallbackOnMeshAlter( wrapperOnMeshAlter );
		prepData.callbacks = updatedCallbacks;

		loaderRef.run( prepData );
	};

	WorkerDirector.prototype._buildLoader = function ( instanceNo ) {
		var classDef = this.workerDescription.classDef;
		var loader = Object.create( classDef.prototype );
		this.workerDescription.classDef.call( loader );

		// verify that all required functions are implemented
		if ( ! loader.hasOwnProperty( 'instanceNo' ) ) throw classDef.name + ' has no property "instanceNo".';
		loader.instanceNo = instanceNo;

		if ( ! loader.hasOwnProperty( 'workerSupport' ) ) {

			throw classDef.name + ' has no property "workerSupport".';

		} else if ( ! classDef.workerSupport instanceof THREE.LoaderSupport.WorkerSupport ) {

			throw classDef.name + '.workerSupport is not of type "THREE.LoaderSupport.WorkerSupport".';

		}
		if ( typeof loader.setWorkerSupport !== 'function'  ) throw classDef.name + ' has no function "setWorkerSupport".';
		if ( typeof loader.run !== 'function'  ) throw classDef.name + ' has no function "run".';

		return loader;
	};

	/**
	 * Terminate all workers.
	 * @memberOf THREE.LoaderSupport.WorkerDirector
	 */
	WorkerDirector.prototype.deregister = function () {
		console.log( 'WorkerDirector received the deregister call. Terminating all workers!' );

		for ( var i = 0, length = this.workerDescription.workerSupports.length; i < length; i++ ) {

			var workerSupport = this.workerDescription.workerSupports[ i ];
			workerSupport.setTerminateRequested( true );
			console.log( 'Requested termination of worker.' );

			var workerCallbacks = workerSupport.loaderRef.callbacks;
			if ( Validator.isValid( workerCallbacks.onProgress ) ) workerCallbacks.onProgress( '' );

		}

		this.workerDescription.workerSupports = [];
		this.instructionQueue = [];
	};

	return WorkerDirector;

})();

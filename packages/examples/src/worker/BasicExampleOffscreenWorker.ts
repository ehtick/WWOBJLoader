import {
    comRouting,
    DataPayload,
    WorkerTaskCommandResponse,
    WorkerTaskMessage,
    WorkerTaskMessageType,
    WorkerTaskWorker
} from 'wtd-core';
import { OBJLoader2BasicExample } from '../examples/OBJLoader2BasicExample.js';
import { executeExample, resizeDisplayGL } from '../examples/ExampleCommons.js';

export class HelloWorlThreedWorker implements WorkerTaskWorker {

    private objLoader2BasicExample?: OBJLoader2BasicExample;

    init(message: WorkerTaskMessageType) {
        console.log(`HelloWorldWorker#init: name: ${message.name} id: ${message.id} cmd: ${message.cmd} workerId: ${message.workerId}`);

        const initComplete = WorkerTaskMessage.createFromExisting(message, WorkerTaskCommandResponse.INIT_COMPLETE);
        self.postMessage(initComplete);
    }

    intermediate(message: WorkerTaskMessageType): void {
        console.log(`HelloWorldWorker#intermediateMessage: name: ${message.name} id: ${message.id} cmd: ${message.cmd} workerId: ${message.workerId}`);

        const dataPayload = message.payloads[0] as DataPayload;
        if (dataPayload.message.params?.$type === 'resize' && this.objLoader2BasicExample) {
            const canvasDimensions = this.objLoader2BasicExample.getSetup().canvasDimensions;
            canvasDimensions.width = dataPayload.message.params?.width as number;
            canvasDimensions.height = dataPayload.message.params?.height as number;
            canvasDimensions.pixelRatio = dataPayload.message.params?.pixelRatio as number;
            resizeDisplayGL(this.objLoader2BasicExample.getSetup());
        }
        if (dataPayload.message.params?.$type === 'terminate') {
            const execComplete = WorkerTaskMessage.createFromExisting(message, WorkerTaskCommandResponse.EXECUTE_COMPLETE);
            const transferables = WorkerTaskMessage.pack(execComplete.payloads, false);
            self.postMessage(execComplete, transferables);
        }
    }

    execute(message: WorkerTaskMessageType) {
        console.log(`HelloWorldWorker#execute: name: ${message.name} id: ${message.id} cmd: ${message.cmd} workerId: ${message.workerId}`);

        const dataPayload = message.payloads[0] as DataPayload;
        const canvasDimensions = {
            width: dataPayload.message.params?.width as number,
            height: dataPayload.message.params?.height as number,
            pixelRatio: dataPayload.message.params?.pixelRatio as number
        };
        this.objLoader2BasicExample = new OBJLoader2BasicExample(dataPayload.message.params?.drawingSurface as HTMLCanvasElement,
            canvasDimensions, dataPayload.message.params?.modelUrl as string);
        executeExample(this.objLoader2BasicExample);
    }

}

const worker = new HelloWorlThreedWorker();
self.onmessage = message => comRouting(worker, message);

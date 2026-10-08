// Run the production browser worker in a real Node thread for regression tests.
const { Worker: NodeWorker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { fileURLToPath } = require('node:url');
const path = require('node:path');
if (!isMainThread) {
    global.self = { postMessage: data => parentPort.postMessage(data) };
    global.importScripts = file => {
        global.midi2abcModule = require(path.resolve(path.dirname(workerData), file));
    };
    require(workerData);
    parentPort.on('message', data => self.onmessage({ data }));
} else {
    module.exports = class BrowserWorker {
        constructor(url) {
            this.worker = new NodeWorker(__filename, { workerData: fileURLToPath(url) });
            this.worker.on('message', data => this.onmessage?.({ data }));
            this.worker.on('error', error => this.onerror?.({ message: error.message }));
        }
        postMessage(data, transfer) { this.worker.postMessage(data, transfer); }
        terminate() { this.worker.terminate(); }
    };
}

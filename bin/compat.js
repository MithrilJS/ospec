"use strict"

// here lies code to even out API inconsistencies between
// the various methods that can underlie the new test
// runner:
//
// - `import()` vs `require()`
// - `worker_threads` vs `child_process`

// eval required for b/w compat (a bare `import()` causes the parser to
// throw otherwise).
function loadWithImport (x) {
	return eval("import(x)")
}

async function loadWithRequire (x) {
	return require(x)
}

function throwIt(e) {
	throw e
}

const threadAPI = (() => {
	try {
		// Modern NodeJS
		const {Worker, parentPort, workerData: wd} = require("worker_threads")
		const useModule = wd != null && wd.includes("--module")
		return {
			spawn(name, workerData) {
				const w = new Worker(name, {workerData})
				w.on("error", throwIt)
				return w
			},
			// JSON.stringify()/.parse() is faster than the structured copy
			// algorithm, especially for large objects. Also, postMessage
			// seems not to like the results as they are handed by ospec.
			// It hangs forever unless the objects are first copied
			// manually.
			sendMessage(worker, message) {
				worker.postMessage(JSON.stringify(message))
			},
			decodeMessage(msg) {
				return JSON.parse(msg)
			},
			terminate(worker) {
				worker.terminate()
			},
			parent: parentPort,
			useModule
		}
	} catch(_) {
		// Fallback
		const child_process = require("child_process")
		const useModule = process.argv.includes("--module")
		return {
			spawn(name, args) {
				const p = child_process.fork(name, args, {stdio: 'inherit'})
				p.on("error", throwIt)
				return p
			},
			sendMessage(_process, message) {
				_process.send(message)
			},
			decodeMessage(msg) {
				return msg
			},
			terminate(_process) {
				_process.kill('SIGTERM')
			},
			parent: process,
			useModule
		}
	}
})()

module.exports = Object.assign({
		loadWithImport,
		loadWithRequire,
	},
	threadAPI
)

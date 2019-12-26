"use strict"

const o = require("../ospec")

const glob = require("glob")
const os = require("os")
const path = require("path")
const {Worker} = require("worker_threads")

module.exports = async function asyncCore({globList, ignore, parallel, dependencies, cwd}) {
	if (dependencies) await Promise.all(
		dependencies.filter((dep) => dep != null).map(
			(module) => import(require.resolve(module, {paths: [cwd]}))
		)
	)

	var cores = parallel ? os.cpus().length : 1

	const testQueue = []
	const results = []
	const threads = []
	let globsPending = globList.length

	function next(task, resolve, worker = null) {
		if (testQueue.length > 0) resolve(task(testQueue.shift(), worker))
		// poll to avoid a race condition when the test workers are
		// being starved by a long-running glob with few matches
		else if (globsPending > 0) setTimeout(() => next(task, resolve, worker), 10)
		// nothing left in the queue, we're done.
		else {
			if (worker != null) worker.terminate()
			resolve()
		}
	}

	function localTask(path) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (resolve) => {
			try {
				await import(path)
				o.run((res) => {
					results[path] = res
					next(localTask, resolve)
				})
			} catch(e) {
				results.push({pass: false, context: e.message, message: e.stack, error: e})
				next(localTask, resolve)
			}
		})
	}

	function workerTask(path, worker) {
		return new Promise((resolve) => {
			worker.on("message", function onMessage(res) {
				worker.off("message", onMessage)
				results[path] = res
				next(workerTask, resolve, worker)
			})
			worker.postMessage(path)
		})
	}

	// with the parallel runner and multiple glob patters,
	// the same file may end up being `imported()` several times
	// in different threads. We thus keep a tally of the scheduled
	// files to avoid the issue.
	const scheduled = new Set()

	function schedule(path) {
		if (!scheduled.has(path)) {
			scheduled.add(path)
			if (cores-- > 0) {
				if (cores > 0) {
					threads.push(workerTask(path, new Worker(require.resolve("./worker"))))
				} else {
					// common path for non-parallel runs and for the last task
					// in parallel mode, which runs in the same thread as the
					// glob
					threads.push(localTask(path))
				}
			} else testQueue.push(path)
		}
	}

	// To minimize the thread communication overhead, messages are compressed
	// to a success count and a failure list. Since the reporter expects a
	// results list, we restore the "pass" items.
	function unpack(results) {
		// ensure that the reporting order is stable
		return Object.keys(results).sort().flatMap((path) => {
			const res = results[path]
			return Array.isArray(res) ? res : unpackOneFile(JSON.parse(res))
		})
	}

	const pass = {pass: true}
	function unpackOneFile(results) {
		const res = [...Array(results.pass + results.fail.length)]
		res.forEach((_, i) => (
			res[i] = i < results.fail.length ? results.fail[i] : pass
		))
		return res
	}

	globList.forEach((globPattern) => {
		glob(globPattern, {ignore: ignore})
			.on("match", (fileName) => { schedule(path.join(cwd, fileName)) })
			.on("error", (e) => { console.error(e) })
			.on("end", () => {if (--globsPending === 0) Promise.all(threads).then(() => {
				const failures = o.report(unpack(results))
				// eslint-disable-next-line no-process-exit
				if (failures > 0) process.exit(1)
			})})
	});
}

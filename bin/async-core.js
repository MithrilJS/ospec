"use strict"

const o = require("../ospec")

const glob = require("glob")
const os = require("os")
const path = require("path")
const {
	spawn, sendMessage, decodeMessage, terminate,
	loadWithImport, loadWithRequire
} = require("./compat")

module.exports = async function asyncCore({
	globList, ignore, parallel, useModule, dependencies, cwd
}) {
	const useParallel = parallel != null
	const maxTaskCount = useParallel
		? parallel.length === 0
			// this reflects the number of hardware threads
			? os.cpus().length
			// Extra check because parseInt and Number are too liberal as-is...
			// `Number(null)` is zero, and `Number(["1"])` somehow works
			// thanks to the arcane magic of JS automatic type conversions.
			: Number(parallel[0].match(/^\d+$/))
		: 1
	if (maxTaskCount === 0) {
		console.error(new TypeError(`Invalid value for --parallel: ${parallel[0]}`))
		// eslint-disable-next-line no-process-exit
		process.exit(1)
	}

	const load = useModule ? loadWithImport : loadWithRequire

	if (dependencies) await Promise.all(
		dependencies.filter((dep) => dep != null).map(
			(dep) => load(require.resolve(dep, {paths: [cwd]}))
		)
	)

	const testQueue = []
	const results = []
	const threads = []
	let globsPending = globList.length

	function next(task, fulfill, worker = null) {
		if (testQueue.length > 0) {
			// There's some work to do
			// (avoid growing the stack needlessly)
			process.nextTick(task, testQueue.shift(), fulfill, worker)
		} else if (globsPending > 0) {
			// poll to avoid a race condition when the test workers are
			// being starved by a long-running glob with few matches.
			// Without this, the runner may end prematurely.
			setTimeout(() => next(task, fulfill, worker), 10)
		} else {
			// nothing left in the queue, we're done.
			if (worker != null) terminate(worker)
			fulfill()
		}
	}

	async function localTask(path, fulfill) {
		try {
			await load(path)
			o.run((res) => {
				results[path] = res
				next(localTask, fulfill)
			})
		} catch(e) {
			results.push({
				pass: false, context: e.message, message: e.stack, error: e
			})
			next(localTask, fulfill)
		}
	}

	function workerTask(path, fulfill, worker) {
		worker.once("message", (res) => {
			// do the minimal amount of work while
			// the worker is idling.
			results[path] = res
			next(workerTask, fulfill, worker)
		})
		sendMessage(worker, path)
	}

	// with the parallel runner and multiple glob patters,
	// the same file may end up being `imported()` several times
	// in different threads. We thus keep a tally of the scheduled
	// files to avoid the issue.
	const scheduled = new Set()

	const childOptions = useModule ? ["--module"] : []

	function schedule(path) {
		if (!scheduled.has(path)) {
			scheduled.add(path)
			if (threads.length < maxTaskCount) {
				if (useParallel) {
					threads.push(new Promise((fulfill)=> {
						const worker = spawn(
							require.resolve("./worker"),
							childOptions
						)
						workerTask(path, fulfill, worker)
					}))
				} else {
					threads.push(new Promise(
						(fulfill)=>{localTask(path, fulfill)}
					))
				}
			} else {
				testQueue.push(path)
			}
		}
	}

	// To minimize the thread communication overhead, messages are compressed
	// to a success count and a failure list. Since the reporter expects a
	// results list, we restore the "pass" items.
	function unpack(results) {
		// ensure that the reporting order is stable
		return Object.keys(results).sort().reduce((acc, path) => {
			const res = results[path]
			const unpacked = Array.isArray(res) 
				? res 
				: unpackOneFile(decodeMessage(res))
			acc.push.apply(acc, unpacked)
			return acc
		}, [])
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
			.on("end", async () => {
				if (--globsPending === 0) {
					await Promise.all(threads)
					const failures = o.report(unpack(results))
					// eslint-disable-next-line no-process-exit
					if (failures > 0) process.exit(1)
				}
			})
	});
}

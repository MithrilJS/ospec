"use strict"

const {parentPort} = require("worker_threads")
const o = require("../ospec")

function cloneErr({name, stack, message}) {
	return {name, stack, message}
}

parentPort.on("message", async function(path) {
	try {
		await import(path)
		o.run(function(results) {
			// JSON.stringify()/.parse() is faster than the structured copy
			// algorithm, especially for large objects. Also, postMessage
			// seems not to like the results as they are handed by ospec.
			// It hangs forever unless the objects are first copied
			// manually.
			// We also compress the results, since most tests are expected to
			// pass on a typical run.
			parentPort.postMessage(JSON.stringify(
				results.reduce(
					(acc, r) => {
						if (r.pass) {
							acc.pass++
						} else {
							const {pass, context, message, error, testError} = r
							acc.fail.push({
								pass, context, message,
								error: cloneErr(error), testError: cloneErr(testError)
							})
						}
						return acc
					},
					{pass:0, fail:[]}
				)
			))
		})
	} catch(e) {
		parentPort.postMessage(JSON.stringify({
			pass: 0,
			fail:[{
				pass: false,
				context: e.message,
				message: e.stack,
				error: cloneErr(e)
			}]
		}))
	}
})

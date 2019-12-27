"use strict"

const o = require("../ospec")
const {
	parent, sendMessage, decodeMessage,
	loadWithImport, loadWithRequire, useModule
} = require("./compat")

function cloneErr({name, stack, message}) {
	return {name, stack, message}
}

const load = useModule ? loadWithImport : loadWithRequire

parent.on("message", async function(path) {
	try {
		await load(decodeMessage(path))
		o.run(function(results) {
			// We compress the results, since most tests are expected to
			// pass on a typical run.
			sendMessage(
				parent,
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
			)
		})
	} catch(e) {
		sendMessage(
			parent,
			{
				pass: 0,
				fail: [{
					pass: false,
					context: e.message,
					message: e.stack,
					error: cloneErr(e)
				}]
			}
		)
	}
})

"use strict"

// TODO: properly document this

const o = require("ospec")
const {report} = o
const {writeFileSync, mkdirSync} = require("fs")
const {join} = require("path")

console.log("Logging...")
mkdirSync("./logs", {recursive: true})

function toPlain({message, stack}) {
	return {message, stack}
}

o.report = function(results) {
	const path = join(".", "logs", `${results.length}-${String(Date.now())}.json`)
	writeFileSync(path, JSON.stringify(results.map(
		(r) => {
			r.error=toPlain(r.error)
			r.testError = toPlain(r.testError)
			return r
		}
	), null, 2))
	console.log(`results written to ${path}`)
	return report(results)
}

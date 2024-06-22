// This is a dev script that is shipped with the package because
// I couldn't find a cross-platform way of running code conditionally
// The shell syntaxes are too complex.
"use strict"

// eslint-disable no-process-exit

const {rename} = require("node:fs/promises")
const glob = require("glob")

let count = 0

glob.globStream("node_modules/.bin/ospec*(.*)")

	.on("data", (x) => {console.log(x); count++; rename(x, x.replace(/ospec(?:-stable)?((?:\.\w+)?)/, "ospec-stable$1"))})

	.on("error", (e) => {
		throw e
	})

	.on("end", () => {if (count !== 0) console.log(`We renamed ${count} file${count > 1 ? "s" : ""}`)})


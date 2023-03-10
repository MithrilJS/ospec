
"use strict"
console.log(__filename + " ran")

const o = require("ospec")
o.localAssertions("override")

o(__filename, (o) => {
	console.log(__filename + " had tests")
	o(true).equals(true)
	o(true).equals(true)
})

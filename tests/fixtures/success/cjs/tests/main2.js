
"use strict"
console.log(__filename + " ran")

const o = require("ospec")

o(__filename, () => {
	console.log(__filename + " had tests")
	o(true).equals(true)
	o(true).equals(true)
})

"use strict"

exports["package.json"] = {
	"license": "ISC",
	"scripts": {
		"default": "ospec",
		"preload-one": "ospec --preload ./main.js",
		"preload-several": "ospec --preload ./main.js --preload ./other.js",
		"require-one": "ospec --require ./main.js",
		"require-several": "ospec --require ./main.js --require ./other.js",
		"which" : "which ospec"
	}
}

const throws = {
	cjs: `
"use strict"
console.log(__filename + " ran")
throw __filename + " threw"
`,
	esm: `
"use strict"
console.log(import.meta.url.slice(7) + " ran")
throw import.meta.url.slice(7) + " threw"
`}

const noThrowNoTest = {
	cjs: `
"use strict"
console.log(__filename + " ran")
`,
	esm: `
"use strict"
console.log(import.meta.url.slice(7) + " ran")
`}

const noThrowWithTest = {
	cjs: `
"use strict"
console.log(__filename + " ran")

const o = require("ospec")

o(__filename, () => {
	console.log(__filename + " had tests")
	o(true).equals(true)
	o(true).equals(true)
})
`,
	esm: `
"use strict"
console.log(import.meta.url.slice(7) + " ran")

import {default as o} from 'ospec'

o(import.meta.url.slice(7), () => {
	console.log(import.meta.url.slice(7) + " ran")
	o(true).equals(true)
	o(true).equals(true)
})
`}

exports["js"] = {
	"main.js": throws,
	"other.js": noThrowNoTest,
	tests: {
		"main1.js": noThrowNoTest,
		"main2.js": throws,
	},
	very: {
		deep: {
			"tests" : {
				"deep1.js": throws,
				deeper: {
					"deep2.js": noThrowWithTest
				}
			}
		}
	}
}
"use strict"

exports["package.json"] = {
	"license": "ISC",
	"scripts": {
		"default": "ospec",
		"explicit-one": "ospec ./explicit/explicit1.js",
		"explicit-several": "ospec ./explicit/explicit1.js ./explicit/explicit2.js",
		"explicit-glob": `ospec "explicit/*.js"`,
		// TODO investigate why --ignore is so capricious
		// `tests/test2.js` works, but `./tests/test2.js` doesn't.
		"ignore-one": "ospec --ignore tests/main2.js",
		"ignore-one-glob": `ospec --ignore "very/**/*.js"`,
		"ignore-several": `ospec --ignore "very/**" --ignore tests/main2.js`,
		"preload-one": "ospec --preload ./main.js",
		"preload-several": "ospec --preload ./main.js --preload ./other.js",
		"require-one": "ospec --require ./main.js",
		"require-several": "ospec --require ./main.js --require ./other.js",
		"which" : "which ospec"
	}
}

const noTest = {
	cjs: `
"use strict"
console.log(__filename + " ran")
`,
	esm: `
"use strict"
console.log(import.meta.url.slice(7) + " ran")
	
`}

const withTest = {
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
	explicit: {
		"explicit1.js": withTest,
		"explicit2.js": withTest,
	},
	"main.js": noTest,
	"other.js": noTest,
	tests: {
		"main1.js": withTest,
		"main2.js": withTest,
	},
	very: {
		deep: {
			"tests" : {
				"deep1.js": withTest,
				deeper: {
					"deep2.js": withTest
				}
			}
		}
	}
}
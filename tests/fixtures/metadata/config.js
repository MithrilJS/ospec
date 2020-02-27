"use strict"

exports["package.json"] = {
	"license": "ISC",
	"scripts": {
		"metadata": "ospec default1.js default2.js override.js",
		"which" : "which ospec"
	}
}

const cjsHeader = `
"use strict"
console.log(__filename + " ran")

const o = require("ospec")
`

const esmHeader = `
"use strict"
console.log(import.meta.url.slice(7) + " ran")

import {default as o} from 'ospec'
`

const cjsFileName = "__filename"
const esmFileName = "import.meta.url.slice(7)"

const override = `
o.metadata({file: "foo"})
`

const test = `
o("test", function() {
	const md = o.metadata()
	console.log(md.file + " metadata file from test")
	console.log(md.name + " metadata name from test")
	o().satisfies(function() {
		const md = o.metadata()
		console.log(md.file + " metadata file from assertion")
		console.log(md.name + " metadata name from assertion")
		return {pass: true}
	})
})
`

const file = (header, middle, filename) => `${header}${middle}o.spec(${filename}, function() {
	${test}
})`

const defaultMd = {
	cjs: file(cjsHeader, "", cjsFileName),
	esm: file(esmHeader, "", esmFileName)
}
const overrideMd = {
	cjs: file(cjsHeader, override, cjsFileName),
	esm: file(esmHeader, override, esmFileName)
}
exports["js"] = {
	"default1.js": defaultMd,
	"default2.js": defaultMd,
	"override.js": overrideMd,
}

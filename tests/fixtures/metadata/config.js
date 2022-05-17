"use strict"

exports["package.json"] = {
	"license": "ISC",
	"scripts": {
		"metadata": "ospec default1.js default2.js override.js",
		"which" : "which ospec"
	}
}

const isWindows = process.platform === "win32"

const cjsFileName = "__filename"
const esmFileName =
isWindows ? String.raw`import.meta.url.slice(8).replace(/\//g, '\\')`:
	"import.meta.url.slice(7)"


const cjsHeader = `
"use strict"
console.log(${cjsFileName} + " ran")

const o = require("ospec")
`

const esmHeader = `
"use strict"
console.log(${esmFileName} + " ran")

import {default as o} from 'ospec'
`

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

const file = (header, middle, filename) => `
${header}
${middle}
o.spec(${filename}, function() {
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

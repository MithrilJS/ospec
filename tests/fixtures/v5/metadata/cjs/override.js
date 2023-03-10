

"use strict"
console.log(__filename + " ran")

const o = require("ospec")
o.localAssertions("override")


o.metadata({file: "foo"})

o.spec(__filename, function() {
	
o("test", function(o) {
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

})
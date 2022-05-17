

"use strict"
console.log(import.meta.url.slice(7) + " ran")

import {default as o} from 'ospec'


o.spec(import.meta.url.slice(7), function() {
	
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

})
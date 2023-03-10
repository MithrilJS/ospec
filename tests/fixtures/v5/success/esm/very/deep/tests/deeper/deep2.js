
"use strict"
console.log(import.meta.url.slice(7) + " ran")

import {default as o} from 'ospec'
o.localAssertions("override")

o(import.meta.url.slice(7), (o) => {
	console.log(import.meta.url.slice(7) + " ran")
	o(true).equals(true)
	o(true).equals(true)
})

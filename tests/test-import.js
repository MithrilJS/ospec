"use strict"
const o = require("../ospec")

class Foo {}

class NonFoo {}

o.spec("test", () => {
	o("it works", () => {
		o(Foo).equals(NonFoo)
	})
})

o.run()
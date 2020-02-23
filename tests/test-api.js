"use strict"

// So it can load correctly in browsers using a global instance.
var o
var lib
var callAsync = typeof setImmediate === "function" ? setImmediate : setTimeout
function stringify(x) {
	return JSON.stringify(x, null, 2)
}

if (typeof require !== "undefined") {
	/* eslint-disable global-require */
	o = lib = require("../ospec")
	o =	 require("ospec")
	/* eslint-enable global-require */
} else {
	o = lib = window.o
}

o("API", function() {
	// the rest of the suite only tests instances created with o.new()
	// make sure that the main exported object also exposes the API
	o(typeof lib).equals("function")

	o(typeof lib.after).equals("function")
	o(typeof lib.afterEach).equals("function")
	o(typeof lib.before).equals("function")
	o(typeof lib.beforeEach).equals("function")
	o(typeof lib.cleanStackTrace).equals("function")
	o(typeof lib.new).equals("function")
	o(typeof lib.only).equals("function")
	o(typeof lib.report).equals("function")
	o(typeof lib.run).equals("function")
	o(typeof lib.spec).equals("function")
	o(typeof lib.specTimeout).equals("function")
	o(typeof lib.spy).equals("function")
	o(typeof lib.timeout).equals("function")
})
// this throws an async error that can't be caught in browsers
if (typeof process !== "undefined") {
	o("incomplete assertion", function(done) {
		var stackMatcher = /([\w\.\\\/\-]+):(\d+):/
		// /!\ this test relies on the `new Error` expression being six lines
		// above the `oo("test", function(){...})` call.
		var matches = (new Error).stack.match(stackMatcher)
		if (matches != null) {
			var name = matches[1]
			var num = Number(matches[2])
		}
		var oo = lib.new()
		oo("test", function() {
			var incomplete = oo("incomplete")
			o(Object.getOwnPropertyNames(incomplete).sort()).deepEquals(["i", "value"])
		})
		oo.run(function(results) {
			o(results.length).equals(1)
			o(results[0].message).equals("Incomplete assertion in the test definition starting at...")
			o(results[0].pass).equals(null)
			var stack = oo.cleanStackTrace(results[0].testError)
			var matches2 = stack && stack.match(stackMatcher)
			if (matches != null && matches2 != null) {
				o(matches[1]).equals(name)
				o(Number(matches2[2])).equals(num + 6)
			}
			done()
		})
	})
}

o("one test, one assertion that succeeds", function () {
	var oo = lib.new()
	oo("test", function() {
		oo(true).equals(true)
	})
	oo.run(function(result) {
		o(Array.isArray(result)).equals(true)("result is an Array")
		o(result.length).equals(1)
		o(result[0].pass).equals(true)
	})
})

o("o.only", function(done) {
	var oo = lib.new()

	oo.spec("won't run", function() {
		oo("nope, skipped", function() {
			o(true).equals(false)
		})
	})

	oo.spec("ospec", function() {
		oo("skipped as well", function() {
			oo(true).equals(false)
		})
		oo.only(".only()", function() {
			oo(2).equals(2)
		}, true)
		oo.only("another .only()", function(done) {
			done("that fails")
		}, true)
	})

	oo.run(function(results){
		o(results.length).equals(2)
		o(results[0].pass).equals(true)
		o(results[1].pass).equals(false)

		done()
	})
})

o("named suite", function(done) {
	var oo = lib.new("named suite")
	oo("test", function(){
		oo(true).equals(false)
	})
	oo.run(function(results) {
		o(results.length).equals(1)("results length")
		o(results[0].context).equals("named suite > test")
		done()
	})
})

// Predicate test passing on clone results
o.spec("reporting", function() {
	o("results (assertion order in hooks and tests)", function(done) {
		o.timeout(100) // Waiting on clone

		var oo = lib.new()

		oo.before(function() {
			oo(true).equals(true)
		})
		oo.after(function() {
			oo(true).equals(true)
		})
		oo.beforeEach(function() {
			oo(true).equals(true)
		})
		oo.afterEach(function() {
			oo(true).equals(true)
		})

		oo.spec("wrapper", function () {
			oo.before(function() {
				oo(true).equals(true)
			})
			oo.after(function() {
				oo(true).equals(true)
			})
			oo.beforeEach(function() {
				oo(true).equals(true)
			})
			oo.afterEach(function() {
				oo(true).equals(true)
			})

			oo.spec("inner", function() {
				oo.before(function() {
					oo(true).equals(true)
				})
				oo.after(function() {
					oo(true).equals(true)
				})
				oo.beforeEach(function() {
					oo(true).equals(true)
				})
				oo.afterEach(function() {
					oo(true).equals(true)
				})

				oo("fail", function() {
					oo(true).equals(false)
				})
				oo("pass", function() {
					oo(true).equals(true)
				})
			})
		})

		oo.run(function(results) {
			o(typeof results).equals("object")
			o("length" in results).equals(true)
			o(results.length).equals(20)("Two results")

			o(results[0].context).equals("o.before(  )")
			o(results[1].context).equals("o.before*( wrapper )")
			o(results[2].context).equals("o.before**( wrapper > inner )")

			o(results[3].context).equals("o.beforeEach( wrapper > inner > fail )")
			o(results[4].context).equals("o.beforeEach*( wrapper > inner > fail )")
			o(results[5].context).equals("o.beforeEach**( wrapper > inner > fail )")

			o("error" in results[6]).equals(true)("error key present in failing result")
			o("pass" in results[6]).equals(true)("pass key present in failing result")
			o("message" in results[6]).equals(true)("message key present in failing result")
			o(results[6].context).equals("wrapper > inner > fail")
			o(results[6].pass).equals(false)("Test meant to fail has failed")

			o(results[7].context).equals("o.afterEach**( wrapper > inner > fail )")
			o(results[8].context).equals("o.afterEach*( wrapper > inner > fail )")
			o(results[9].context).equals("o.afterEach( wrapper > inner > fail )")

			o(results[10].context).equals("o.beforeEach( wrapper > inner > pass )")
			o(results[11].context).equals("o.beforeEach*( wrapper > inner > pass )")
			o(results[12].context).equals("o.beforeEach**( wrapper > inner > pass )")

			o("message" in results[13]).equals(true)("message key present in passing result")
			o(results[13].context).equals("wrapper > inner > pass")
			o(results[13].pass).equals(true)("Test meant to pass has passed")

			o(results[14].context).equals("o.afterEach**( wrapper > inner > pass )")
			o(results[15].context).equals("o.afterEach*( wrapper > inner > pass )")
			o(results[16].context).equals("o.afterEach( wrapper > inner > pass )")

			o(results[17].context).equals("o.after**( wrapper > inner )")
			o(results[18].context).equals("o.after*( wrapper )")
			o(results[19].context).equals("o.after(  )")
			done()
		})
	})
	o("o.report() returns the number of failures", function () {
		var log = console.log, error = console.error
		var oo = lib.new()
		console.log = o.spy()
		console.error = o.spy()

		function makeError(msg) {try{throw msg ? new Error(msg) : new Error} catch(e){return e}}
		try {
			var results = [{pass: true}, {pass: true}]
			results.bailCount = results.asyncSuccesses = 0
			var errCount = oo.report(results)

			o(errCount).equals(0)
			o(console.log.callCount).equals(1)
			o(console.error.callCount).equals(0)

			results = [
				{pass: false, error: makeError("hey"), message: "hey"}
			]
			results.bailCount = results.asyncSuccesses = 0
			errCount = oo.report(results)

			o(errCount).equals(1)
			o(console.log.callCount).equals(2)
			o(console.error.callCount).equals(1)

			results = [
				{pass: false, error: makeError("hey"), message: "hey"},
				{pass: true},
				{pass: false, error: makeError("ho"), message: "ho"}
			]
			results.bailCount = results.asyncSuccesses = 0
			errCount = oo.report(results)

			o(errCount).equals(2)
			o(console.log.callCount).equals(3)
			o(console.error.callCount).equals(3)
		} catch (e) {
			o(1).equals(0)("Error while testing the reporter " + e.stack)
		}
		console.log = log
		console.error = error
	})
})

o.spec("ospec", function() {
	o.spec("sync", function() {
		var a = 0, b = 0

		o.before(function() {a = 1})
		o.after(function() {a = 0})

		o.beforeEach(function() {b = 1})
		o.afterEach(function() {b = 0})


		o("test definitions", function(done){
			var nestedThrows = {
				hook: {
					hook: false,
					test: false
				},
				test: {
					hook: false,
					test: false
				}
			}

			var expectedTrows = {
				hook: {
					hook: true,
					test: true
				},
				test: {
					hook: true,
					test: true
				}
			}

			var oo = lib.new()
			var spyHookHook = o.spy()
			var spyHookTest = o.spy()
			var spyTestHook = o.spy()
			var spyTestTest = o.spy()

			oo.before(function() {
				try {oo("illegal test nested in hook", spyHookTest)} catch (e) {nestedThrows.hook.test = true}
				try {oo.beforeEach(spyHookHook)} catch (e) {nestedThrows.hook.hook = true}
			})


			oo("test", function() {
				try {oo("illegal nested test", spyTestTest)} catch (e) {nestedThrows.test.test = true}
				try {oo.after(spyTestHook)} catch (e) {nestedThrows.test.hook = true}
			})

			oo.run(function(){

				o(spyHookHook.callCount).equals(0)
				o(spyHookTest.callCount).equals(0)
				o(spyTestHook.callCount).equals(0)
				o(spyTestTest.callCount).equals(0)

				o({nestedThrows:nestedThrows}).deepEquals({nestedThrows: expectedTrows})

				done()
			})
		})
		o("assertions", function(done) {
			var illegalAssertionThrows = false

			var spy = o.spy()
			spy(a)

			var oo = lib.new()

			try {oo("illegal assertion")} catch (e) {illegalAssertionThrows = true}

			oo("test", function() {
				oo(a).equals(b)
				oo(a).notEquals(2)
				oo({a: [1, 2], b: 3}).deepEquals({a: [1, 2], b: 3})
				oo([{a: 1, b: 2}, {c: 3}]).deepEquals([{a: 1, b: 2}, {c: 3}])
				oo(function(){throw new Error()}).throws(Error)
				oo(function(){"ayy".foo()}).throws(TypeError)
				oo(function(){Math.PI.toFixed(Math.pow(10,20))}).throws(RangeError)
				oo(function(){decodeURIComponent("%")}).throws(URIError)

				oo(function(){"ayy".foo()}).notThrows(SyntaxError)
				oo(function(){throw new Error("foo")}).throws("foo")
				oo(function(){throw new Error("foo")}).notThrows("bar")

				var undef1 = {undef: void 0}
				var undef2 = {UNDEF: void 0}

				oo(undef1).notDeepEquals(undef2)
				oo(undef1).notDeepEquals({})
				oo({}).notDeepEquals(undef1)

				var sparse1 = [void 1, void 2, void 3]
				delete sparse1[0]
				var sparse2 = [void 1, void 2, void 3]
				delete sparse2[1]

				oo(sparse1).notDeepEquals(sparse2)

				var monkeypatch1 = [1, 2]
				monkeypatch1.field = 3
				var monkeypatch2 = [1, 2]
				monkeypatch2.field = 4

				oo(monkeypatch1).notDeepEquals([1, 2])
				oo(monkeypatch1).notDeepEquals(monkeypatch2)

				monkeypatch2.field = 3
				oo(monkeypatch1).deepEquals(monkeypatch2)

				monkeypatch1.undef = undefined
				monkeypatch2.UNDEF = undefined

				oo(monkeypatch1).notDeepEquals(monkeypatch2)

				var values = ["a", "", 1, 0, true, false, null, undefined, Date(0), ["a"], [], function() {return arguments}.call(), new Uint8Array(), {a: 1}, {}]
				for (var i = 0; i < values.length; i++) {
					for (var j = 0; j < values.length; j++) {
						if (i === j) oo(values[i]).deepEquals(values[j])
						else oo(values[i]).notDeepEquals(values[j])
					}
				}
			})

			oo.run(function(results) {
				results.forEach(function(result) {
					o(result.pass).equals(true)(stringify(result))
				})
				o(illegalAssertionThrows).equals(true)
				o(spy.callCount).equals(1)
				o(spy.args.length).equals(1)
				o(spy.args[0]).equals(1)
				o(spy.calls.length).equals(1)
				o(spy.calls[0]).deepEquals({this: undefined, args: [1]})
				done()
			})
		})
		o("spy wrapping", function() {
			var oo = lib.new()
			var spy = oo.spy(function view(vnode){
				this.drawn = true

				return {tag: "div", children: vnode.children}
			})
			var children = [""]
			var state = {}

			var output = spy.call(state, {children: children})

			o(spy.length).equals(1)
			o(spy.name).equals("view")
			o(spy.callCount).equals(1)
			o(spy.args.length).equals(1)
			o(spy.args[0]).deepEquals({children: children})
			o(spy.calls.length).equals(1)
			o(spy.calls[0]).deepEquals({this: state, args: [{children: children}]})
			o(state).deepEquals({drawn: true})
			o(output).deepEquals({tag: "div", children: children})
		})
	})
	o("async callback", function(finished) {
		var a = 0, b = 0

		var oo = lib.new()

		oo.after(function() {
			o(a).equals(0)
			o(b).equals(0)
		})
		oo.spec("dummy spec", function(){
			oo.before(function(done) {
				callAsync(function() {
					a = 1
					done()
				})
			})
			oo.after(function(done) {
				callAsync(function() {
					a = 0
					done()
				})
			})

			oo.beforeEach(function(done) {
				o(b).equals(0)
				callAsync(function() {
					b = 1
					done()
				})
			})
			oo.afterEach(function(done) {
				callAsync(function() {
					b = 0
					done()
				})
			})

			oo("hooks work as intended the first time", function(done) {
				callAsync(function() {
					var spy = o.spy()
					spy(a)

					o(a).equals(1)
					o(b).equals(1)

					done()
				})
			})
			oo("hooks work as intended the second time", function(done) {
				callAsync(function() {
					var spy = o.spy()
					spy(a)

					o(a).equals(1)
					o(b).equals(1)

					done()
				})
			})

			oo.run(function(results) {
				o(results.length).equals(0)
				finished()
			})
		})
	})

	o.spec("throwing in test context is recorded as a failure", function() {
		var oo
		o.beforeEach(function(){oo = lib.new()})
		o.afterEach(function(done) {
			oo.run(function(results) {
				o(results.length).equals(1)
				o(results[0].pass).equals(false)

				done()
			})
		})

		o("sync, throwing an Error", function() {
			oo("", function() {throw new Error("an error")})
		})
		o("async, throwing an Error", function() {
			oo("", function(done) {
				throw new Error("an error")
				done() // eslint-disable-line no-unreachable
			})
		})
		o("sync, throwing a string", function() {
			oo("", function() {throw "a string"})
		})
		o("async, throwing a string", function() {
			oo("", function(done) {
				throw "a string"
				done() // eslint-disable-line no-unreachable
			})
		})
		o("sync, throwing null", function() {
			oo("", function() {throw null})
		})
		o("async, throwing null", function() {
			oo("", function(done) {
				throw null
				done() // eslint-disable-line no-unreachable
			})
		})
		o("sync, throwing undefined", function() {
			oo("", function() {throw undefined})
		})
		o("async, throwing undefined", function() {
			oo("", function(done) {
				throw undefined
				done() // eslint-disable-line no-unreachable
			})
		})
	})

	o.spec("timeout", function () {
		o("when using done()", function(done) {
			var oo = lib.new()
			var err
			// the success of this test is dependent on having the
			// oo() call three linew below this one
			try {throw new Error} catch(e) {err = e}
			if (err.stack) {
				var line = Number(err.stack.match(/:(\d+):/)[1])
				oo("", function(oodone, timeout) {
					timeout(1)
					// eslint-disable-next-line no-constant-condition
					if (false) oodone()
				})
				oo.run((function(results) {
					o(results.length).equals(1)
					o(results[0].pass).equals(false)
					// todo test cleaned up results[0].error stack trace for the presence
					// of the timeout stack entry
					o(results[0].testError instanceof Error).equals(true)
					o(oo.cleanStackTrace(results[0].testError).indexOf("test-api.js:" + (line + 3) + ":")).notEquals(-1)

					done()
				}))
			} else {
				done()
			}
		})
		o("when using a thenable", function(done) {
			var oo = lib.new()
			var err
			// /!\ the success of this test is dependent on having the /!\
			// oo() call three lines below this one
			try {throw new Error} catch(e) {err = e}
			if (err.stack) {
				var line = Number(err.stack.match(/:(\d+):/)[1])
				oo("", function() {
					oo.timeout(1)
					return {then: function(){}}
				})
				oo.run((function(results) {
					o(results.length).equals(1)
					o(results[0].pass).equals(false)
					o(results[0].testError instanceof Error).equals(true)
					o(oo.cleanStackTrace(results[0].testError).indexOf("test-api.js:" + (line + 3) + ":")).notEquals(-1)

					done()
				}))
			} else {
				done()
			}
		})
	})
	o.spec("o.timeout", function() {
		o("throws when called out of test definitions", function(done) {
			var oo = lib.new()
			var oTimeout = o.spy(function(){
				oo.timeout(30)
			})

			o(oTimeout).throws(Error)

			oo.spec("a spec", function() {
				o(oTimeout).throws(Error)
			})
			oo("some test", function() {
				o(oTimeout).notThrows(Error)
				return {then: function(f) {setTimeout(f)}}
			})
			oo.run(function(result) {
				o(result.length).equals(0)
				o(oTimeout.callCount).equals(3)

				done()
			})
		})
		o("works", function(done) {
			var oo = lib.new()
			var t = new Date
			oo("", function() {
				oo.timeout(10)
				return {then: function() {}}
			})
			oo.run(function(results){
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(new Date - t >= 10).equals(true)
				o(200 > new Date - t).equals(true)

				done()
			})
		})
	})
	o.spec("o.specTimeout", function() {
		o("throws when called inside of test definitions", function(done) {
			var oo = lib.new()

			var oSpecTimeout = o.spy(function(){
				oo.specTimeout(5)
			})

			oo("", function() {

				o(oSpecTimeout).throws(Error)

				return {then: function(f) {setTimeout(f)}}
			})
			oo.run(function(result) {
				o(result.length).equals(0)
				done()
			})
		})
		o("works", function(done) {
			var oo = lib.new()
			var t

			oo.specTimeout(10)
			oo.beforeEach(function () {
				t = new Date
			})
			oo.afterEach(function () {
				var diff = new Date - t
				o(diff >= 10).equals(true)
				o(diff < 200).equals(true)
			})

			oo("", function() {
				oo(true).equals(true)

				return {then: function() {}}
			})

			oo.run(function(results) {
				o(results.length).equals(2)
				o(results[0].pass).equals(true)
				o(results[1].pass).equals(false)
				done()
			})
		})
		o("The parent and sibling suites are not affected by the specTimeout", function(done) {
			var oo = lib.new()
			var t

			oo.specTimeout(50)
			oo.beforeEach(function () {
				t = new Date
			})
			oo.afterEach(function () {
				var diff = new Date - t
				o(diff >= 50).equals(true)
				o(diff < 80).equals(true)
			})

			oo.spec("nested 1", function () {
				oo.specTimeout(80)
			})

			oo("", function() {
				oo(true).equals(true)

				return {then: function() {}}
			})
			oo.spec("nested 2", function () {
				oo.specTimeout(80)
			})
			oo.spec("nested 3", function () {
				oo("", function() {
					oo(true).equals(true)

					return {then: function() {}}
				})
			})
			oo.run(function(results) {
				o(results.length).equals(4)
				o(results[0].pass).equals(true)
				o(results[1].pass).equals(false)
				o(results[2].pass).equals(true)
				o(results[3].pass).equals(false)
				done()
			})
		})
		o("nested suites inherit the specTimeout", function(done) {
			var oo = lib.new()

			oo.specTimeout(50)
			oo.spec("nested", function () {
				oo.spec("deeply", function() {
					var t

					oo.beforeEach(function () {
						t = new Date
					})
					oo.afterEach(function () {
						var diff = new Date - t
						o(diff >= 50).equals(true)
						o(diff < 80).equals(true)
					})

					oo("", function() {
						oo(true).equals(true)

						return {then: function() {}}
					})
				})
			})
			oo.run(function(results) {
				o(results.length).equals(2)
				o(results[0].pass).equals(true)
				o(results[1].pass).equals(false)
				done()
			})
		})
	})

	o.spec("calling done() twice throws", function () {
		o("two successes", function(done) {
			var oo = lib.new()
			var err = null
			oo("foo", function(oodone) {
				try {
					oodone()
					oodone()
				} catch (e) {
					err = e
				}
				o(err instanceof Error).equals(true)
				o(err.message).equals("'oodone()' should only be called once.")
			})
			oo.run(function(results) {
				o(results.length).equals(0)
				done()
			})
		})
		o("a success followed by an error", function(done) {
			var oo = lib.new()
			var err = null
			oo("foo", function(oodone) {
				try {
					oodone()
					oodone("error")
				} catch (e) {
					err = e
				}
				o(err instanceof Error).equals(true)
				o(err.message).equals("'oodone()' should only be called once.")
			})
			oo.run(function(results) {
				o(results.length).equals(0)
				done()
			})
		})
		o("two errors", function(done) {
			var oo = lib.new()
			var err = null
			oo("foo", function(oodone) {
				try {
					oodone("bar")
					oodone("baz")
				} catch (e) {
					err = e
				}
				o(err instanceof Error).equals(true)
				o(err.message).equals("'oodone()' should only be called once.")
			})
			oo.run(function(results) {
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("bar")
				done()
			})
		})
		o("an error followed by a success", function(done) {
			var oo = lib.new()
			var err = null
			oo("foo", function(oodone) {
				try {
					oodone("bar")
					oodone()
				} catch (e) {
					err = e
				}
				o(err instanceof Error).equals(true)
				o(err.message).equals("'oodone()' should only be called once.")
			})
			oo.run(function(results) {
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("bar")
				done()
			})
		})
	})

	o.spec("stack trace cleaner", function() {
		o("handles line breaks", function() {
			var oo = lib.new()
			try {
				throw new Error("line\nbreak")
			} catch(error) {
				var trace = oo.cleanStackTrace(error)
				o(trace).notEquals("break")
				o(trace.indexOf("test-api.js") !== -1).equals(true)
			}
		})
	})

	if (typeof Promise === "function") o("async promise", function(done) {
		var a = 0, b = 0, ran = false
		var oo = lib.new()

		function wrapPromise(fn) {
			return new Promise(function (resolve, reject) {
				callAsync(function () {
					try {
						fn()
						resolve()
					} catch(e) {
						reject(e)
					}
				})
			})
		}

		oo.before(function() {
			return wrapPromise(function () {
				a = 1
			})
		})

		oo.after(function() {
			return wrapPromise(function() {
				a = 0
			})
		})

		oo.beforeEach(function() {
			return wrapPromise(function() {
				b = 1
			})
		})
		oo.afterEach(function() {
			return wrapPromise(function() {
				b = 0
			})
		})

		oo("promise functions", function() {
			return wrapPromise(function() {
				ran = true
				o(a).equals(b)
				o(a).equals(1)("a and b should be initialized")
			})
		})
		oo.run(function(results) {
			o(results.length).equals(0)
			o(ran).equals(true)

			done()
		})
	})

	o.spec("descriptions", function() {
		o("description returned on failure", function(done) {
			var oo = lib.new()
			oo("no description", function() {
				oo(1).equals(2)
			})
			oo("description", function() {
				oo(1).equals(2)("howdy")
			})
			oo.run(function(results) {
				o(results.length).equals(2)
				o(results[1].message).equals("howdy\n\n"+results[0].message)
				o(results[1].pass).equals(false)

				done()
			})
		})
	})
})
o.spec("the done parser", function() {
	o("accepts non-English names", function(done) {
		var oo = lib.new()
		var threw = false
		oo("test", function(完了) {
			oo(true).equals(true)
			完了()
		})
		try {
			oo.run(function(results){
				o(results.length).equals(1)
				results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
				done()
			})
		} catch(e) {threw = e.stack}

		o(threw).equals(false)
	})
	o("tolerates comments with an ES5 function expression and a timeout parameter", function(done) {
		var oo = lib.new()
		var threw = false
		oo("test", function(/*hey
			*/ /**/ //ho
			done /*hey
			*/ /**/ //huuu
			, timeout
		) {
			timeout(5)
			oo(true).equals(true)
			done()
		})
		try {
			oo.run(function(results){
				o(results.length).equals(1)
				results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
				done()
			})
		} catch(e) {threw = e.stack}

		o(threw).equals(false)
	})
	/*eslint-disable no-eval*/
	o("tolerates comments with an ES5 function expression and no timeoout parameter, unix-style line endings", function(done) {
		var oo = lib.new()
		var threw = false
		oo("test", eval("(function(/*hey \n*/ /**/ //ho\n done /*hey \n	*/ /**/ //huuu\n) {oo(true).equals(true);done()})"))
		try {
			oo.run(function(results){
				o(results.length).equals(1)
				results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
				done()
			})
		} catch(e) {threw = e.stack}

		o(threw).equals(false)
	})
	o("tolerates comments with an ES5 function expression and no timeoout parameter, windows-style line endings", function(done) {
		var oo = lib.new()
		var threw = false
		oo("test", eval("(function(/*hey \r\n*/ /**/ //ho\r\n done /*hey \r\n	*/ /**/ //huuu\r\n) {oo(true).equals(true);done()})"))
		try {
			oo.run(function(results){
				o(results.length).equals(1)
				results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
				done()
			})
		} catch(e) {threw = e.stack}

		o(threw).equals(false)
	})
	try {eval("(()=>{})()"); o.spec("with ES6 arrow functions", function() {
		function getCommentContent(f) {
			f = f.toString()
			return f.slice(f.indexOf("/*") + 2, f.lastIndexOf("*/"))
		}
		o("has no false positives 1", function(done){
			var oo = lib.new()
			var threw = false
			eval(getCommentContent(function(){/*
				oo(
					'Async test parser mistakenly identified 1st token after a parens to be `done` reference',
					done => {
						oo(threw).equals(false)
						done()
					}
				)
			*/}))
			try {
				oo.run(function(results){
					o(results.length).equals(1)
					results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
					done()
				})
			} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("has no false positives 2", function(done){
			var oo = lib.new()
			var threw = false
			eval(getCommentContent(function(){/*
				oo(
					'Async test parser mistakenly identified 1st token after a parens to be `(done)` reference',
					(done) => {
						oo(threw).equals(false)
						done()
					}
				)
			*/}))
			try {
				oo.run(function(results){
					o(results.length).equals(1)
					results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
					done()
				})
			} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("has no false negatives", function(){
			var oo = lib.new()
			var threw = false
			var reporterRan = false
			eval(getCommentContent(function(){/*
				oo(
					"Multiple references to the wrong thing doesn't fool the checker",
					done => {
						oo(threw).equals(false)
						oo(threw).equals(false)
					}
				)
			*/}))
			try {oo.run(function(){reporterRan = true})} catch(e) {threw = true}

			o(reporterRan).equals(false)
			o(threw).equals(true)
		})
		o("has no false negatives 2", function(){
			var oo = lib.new()
			var threw = false
			var reporterRan = false
			eval(getCommentContent(function(){/*
				oo(
					"Multiple references to the wrong thing doesn't fool the checker",
					(done) => {
						oo(threw).equals(false)
						oo(threw).equals(false)
					}
				)
			*/}))
			try {oo.run(function(){reporterRan = true})} catch(e) {threw = true}

			o(reporterRan).equals(false)
			o(threw).equals(true)
		})
		o("has no false negatives 3", function(){
			var oo = lib.new()
			var threw = false
			var reporterRan = false
			eval(getCommentContent(function(){/*
				oo(
					"Multiple references to the wrong thing doesn't fool the checker",
					(done)=>{
						oo(threw).equals(false)
						oo(threw).equals(false)
					}
				)
			*/}))
			try {oo.run(function(){reporterRan = true})} catch(e) {threw = true}

			o(reporterRan).equals(false)
			o(threw).equals(true)
		})
		o("works with a literal that has parentheses but no spaces", function(done){
			var oo = lib.new()
			var threw = false
			eval(getCommentContent(function(){/*
				oo(
					"Multiple references to the wrong thing doesn't fool the checker",
					(done)=>{
						oo(threw).equals(false)
						done()
					}
				)
			*/}))
			try {
				oo.run(function(results){
					o(results.length).equals(1)
					results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
					done()
				})
			} catch(e) {threw = e.stack}
			o(threw).equals(false)
		})
		o("isn't fooled by comments", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("done /*hey*/ /**/ => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("isn't fooled by comments (no parens)", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("done /*hey*/ /**/ => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("isn't fooled by comments (with parens, no timeout, unix-style line endings)", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("(done /*hey*/ //ho \n/**/) => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("isn't fooled by comments (with parens, no timeout, windows-style line endings)", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("(done /*hey*/ //ho \r\n/**/) => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("isn't fooled by comments (with parens, with timeout, unix-style line endings)", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("(done /*hey*/ //ho \n/**/, timeout) => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
		o("isn't fooled by comments (with parens, with timeout, windows-style line endings)", function(){
			var oo = lib.new()
			var threw = false
			oo(
				"comments won't throw the parser off",
				eval("(done /*hey*/ //ho \r\n/**/, timeout) => {oo(threw).equals(false);done()}")
			)
			try {oo.run(function(){})} catch(e) {threw = e.stack}

			o(threw).equals(false)
		})
	})} catch (e) {/*ES5 env, or no eval, ignore*/}
	/*eslint-enable no-eval*/
})

o.spec("satisfies / notSatisfies", function() {
	o.spec("satisfies", function() {
		o("passes when returning string", function(done) {
			var oo = lib.new()
			var getsFiveAndReturnsString = o.spy(function(value) {
				o(value).equals(5)
				return "Ok"
			})
			oo("test", function() {
				oo(5).satisfies(getsFiveAndReturnsString)
			})
			oo.run(function(results) {
				o(getsFiveAndReturnsString.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(true)
				o(results[0].message).equals("Ok")

				done()
			})
		})
		o("passes when returning non-string", function(done) {
			var oo = lib.new()
			var getsFiveAndReturnsNumber = o.spy(function(value) {
				o(value).equals(5)
				return 5
			})
			oo("test", function() {
				oo(5).satisfies(getsFiveAndReturnsNumber)
			})
			oo.run(function(results) {
				o(getsFiveAndReturnsNumber.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(true)
				o(results[0].message).equals("5")("stringified message")

				done()
			})
		})
		o("fails when throwing string", function(done) {
			var oo = lib.new()
			var getsFiveandThrowsString = o.spy(function(value) {

				o(value).equals(5)

				throw "Not Ok"
			})
			oo("test", function() {
				oo(5).satisfies(getsFiveandThrowsString)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsString.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("Not Ok")

				done()
			})
		})
		o("fails when throwing number", function(done) {
			var oo = lib.new()
			var getsFiveandThrowsNumber = o.spy(function(value) {

				o(value).equals(5)

				throw 5
			})
			oo("test", function() {
				oo(5).satisfies(getsFiveandThrowsNumber)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsNumber.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("5")("stringified message")

				done()
			})
		})
		o("fails when throwing error", function(done) {
			var oo = lib.new()
			var err = new Error("An Error")
			var getsFiveandThrowsError = o.spy(function(value) {

				o(value).equals(5)

				throw err
			})
			oo("test", function() {
				oo(5).satisfies(getsFiveandThrowsError)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsError.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("An Error")
				o(results[0].error).equals(err)

				done()
			})
		})
	})
	o.spec("notSatisfies", function() {
		o("fails when returning string", function(done) {
			var oo = lib.new()
			var getsFiveAndReturnsString = o.spy(function(value) {
				o(value).equals(5)
				return "Ok"
			})
			oo("test", function() {
				oo(5).notSatisfies(getsFiveAndReturnsString)
			})
			oo.run(function(results) {
				o(getsFiveAndReturnsString.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("Ok")

				done()
			})
		})
		o("fails when returning non-string", function(done) {
			var oo = lib.new()
			var getsFiveAndReturnsNumber = o.spy(function(value) {
				o(value).equals(5)
				return 5
			})
			oo("test", function() {
				oo(5).notSatisfies(getsFiveAndReturnsNumber)
			})
			oo.run(function(results) {
				o(getsFiveAndReturnsNumber.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(false)
				o(results[0].message).equals("5")("stringified message")

				done()
			})
		})
		o("passes when throwing string", function(done) {
			var oo = lib.new()
			var getsFiveandThrowsString = o.spy(function(value) {

				o(value).equals(5)

				throw "Not Ok"
			})
			oo("test", function() {
				oo(5).notSatisfies(getsFiveandThrowsString)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsString.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(true)
				o(results[0].message).equals("Not Ok")

				done()
			})
		})
		o("passes when throwing number", function(done) {
			var oo = lib.new()
			var getsFiveandThrowsNumber = o.spy(function(value) {

				o(value).equals(5)

				throw 5
			})
			oo("test", function() {
				oo(5).notSatisfies(getsFiveandThrowsNumber)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsNumber.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(true)
				o(results[0].message).equals("5")("stringified message")

				done()
			})
		})
		o("passes when throwing error", function(done) {
			var oo = lib.new()
			var err = new Error("An Error")
			var getsFiveandThrowsError = o.spy(function(value) {

				o(value).equals(5)

				throw err
			})
			oo("test", function() {
				oo(5).notSatisfies(getsFiveandThrowsError)
			})
			oo.run(function(results) {

				o(getsFiveandThrowsError.callCount).equals(1)
				o(results.length).equals(1)
				o(results[0].pass).equals(true)
				o(results[0].message).equals("An Error")
				o(results[0].error).equals(err)

				done()
			})
		})
	})
})

o.spec("throwing bails out of the current spec", function() {
	o("Two tests. Throwing in the first causes the second not to run", function(done) {
		var before = o.spy()
		var after = o.spy()
		var beforeEach = o.spy()
		var afterEach = o.spy()
		var secondTest = o.spy()

		var oo = lib.new()

		oo.before(before)
		oo.after(after)
		oo.beforeEach(beforeEach)
		oo.afterEach(afterEach)

		oo("throws", function(){
			throw "FOOO"
		})
		oo("skipped", secondTest)

		oo.run(function(results) {
			o(results.length).equals(1)
			o(results[0].pass).equals(false)

			o(before.callCount).equals(1)
			o(after.callCount).equals(1)
			o(beforeEach.callCount).equals(1)
			o(afterEach.callCount).equals(1)

			o(secondTest.callCount).equals(0)

			done()
		})
	})
	o("Two tests, the second one nested in a spec. Throwing in the first causes the second not to run", function(done) {
		var before = o.spy()
		var after = o.spy()
		var beforeEach = o.spy()
		var afterEach = o.spy()

		var before2 = o.spy()
		var after2 = o.spy()
		var beforeEach2 = o.spy()
		var afterEach2 = o.spy()

		var secondTest = o.spy()

		var oo = lib.new()

		oo.before(before)
		oo.after(after)
		oo.beforeEach(beforeEach)
		oo.afterEach(afterEach)

		oo("throws", function(){
			throw "FOOO"
		})
		oo.spec("nested", function() {
			oo.before(before2)
			oo.after(after2)
			oo.beforeEach(beforeEach2)
			oo.afterEach(afterEach2)

			oo("skipped", secondTest)
		})

		oo.run(function(results) {
			o(results.length).equals(1)
			o(results[0].pass).equals(false)

			o(before.callCount).equals(1)
			o(after.callCount).equals(1)
			o(beforeEach.callCount).equals(1)
			o(afterEach.callCount).equals(1)

			o(before2.callCount).equals(0)
			o(after2.callCount).equals(0)
			o(beforeEach2.callCount).equals(0)
			o(afterEach2.callCount).equals(0)

			o(secondTest.callCount).equals(0)

			done()
		})
	})
	o("Two tests, the first one nested in a spec. Throwing in the first doesn't causes the second not to run", function(done) {
		var before = o.spy()
		var after = o.spy()
		var beforeEach = o.spy()
		var afterEach = o.spy()

		var before2 = o.spy()
		var after2 = o.spy()
		var beforeEach2 = o.spy()
		var afterEach2 = o.spy()

		var secondTest = o.spy()

		var oo = lib.new()

		oo.before(before)
		oo.after(after)
		oo.beforeEach(beforeEach)
		oo.afterEach(afterEach)

		oo.spec("nested", function() {
			oo.before(before2)
			oo.after(after2)
			oo.beforeEach(beforeEach2)
			oo.afterEach(afterEach2)
			oo("throws", function(){
				throw "FOOO"
			})

		})
		oo("runs", secondTest)

		oo.run(function(results) {
			o(results.length).equals(1)
			o(results[0].pass).equals(false)

			o(before.callCount).equals(1)
			o(after.callCount).equals(1)
			o(beforeEach.callCount).equals(2)
			o(afterEach.callCount).equals(2)

			o(before2.callCount).equals(1)
			o(after2.callCount).equals(1)
			o(beforeEach2.callCount).equals(1)
			o(afterEach2.callCount).equals(1)

			o(secondTest.callCount).equals(1)

			done()
		})
	})
	o("throwing in the before hook causes the tests of the spec not to run", function(done) {
		var after = o.spy()
		var beforeEach = o.spy()
		var afterEach = o.spy()

		var test = o.spy()

		var oo = lib.new()
		oo.before(function(){
			throw "HAHA!"
		})
		oo.after(after)
		oo.beforeEach(beforeEach)
		oo.afterEach(afterEach)

		oo("skipped", test)

		oo.run(function(results) {
			o(results.length).equals(1)
			o(results[0].pass).equals(false)

			o(after.callCount).equals(1)
			o(beforeEach.callCount).equals(0)
			o(afterEach.callCount).equals(0)

			o(test.callCount).equals(0)

			done()
		})
	})
})
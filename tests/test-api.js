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
	o = require("ospec")
	lib = require("../ospec")
	/* eslint-enable global-require */
} else {
	o = lib = window.o
}

o.spec("no output", function() {
	// Most of the lib should never print anything
	// Allowed exceptions: deprecation warnings, and
	// the reporter, obviously.

	var consoleOriginals = {}
	var consoleCounts = {}
	// eslint-disable-next-line no-unused-vars
	var LOG = console.log.bind(console)

	o.before(function() {
		Object.keys(console).forEach(function(name) {
			if (typeof console[name] === "function") {
				consoleOriginals[name] = console[name]
				console[name] = o.spy(console[name])
				consoleCounts[name] = 0
			}
		})
	})
	o.after(function(){
		Object.keys(consoleOriginals).forEach(function(name) {
			console[name] = consoleOriginals[name]
		})
	})
	o.afterEach(function() {
		Object.keys(consoleCounts).forEach(function(name) {
			var actual = console[name].callCount
			var expected = consoleCounts[name]
			if (expected !== actual) {
				o({callCount: actual - expected}).deepEquals({callCount: 0})(name)
			}
			consoleCounts[name] = actual
		})
	})

	if (spec.toString().indexOf("console") !== -1) {
		throw new Error("Avoid referencing the console in the 'no output' test suite. For logging, use the `LOG(...)` helper.")
	} else {
		o.spec("", spec)
	}
	function spec(){
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
					try {
						o(results.length).equals(1)
						o(results[0].message).equals("Incomplete assertion in the test definition starting at...")
						o(results[0].pass).equals(null)

						var stack = oo.cleanStackTrace(results[0].task.error)
						var matches2 = stack && stack.match(stackMatcher)

						if (matches != null && matches2 != null) {
							o(matches[1]).equals(name)
							o(Number(matches2[2])).equals(num + 6)
						}
						done()
					} catch (e) {
						done(e)
					}
				})
			})
		}

		o("one test, one assertion that succeeds", function (done) {
			var oo = lib.new()
			oo("test", function() {
				oo(true).equals(true)
			})
			oo.run(function(result) {
				try {
					o(Array.isArray(result)).equals(true)("result is an Array")
					o(result.length).equals(1)
					o(result[0].pass).equals(true)
					done()
				} catch (e) {
					done(e)
				}
			})
		})

		o("o.run", function(done) {
			var oo = lib.new()
			var spy = o.spy()
			oo.spec("tacular", function() {
				o(function(){oo.run()}).throws(Error)
				o(function(){oo.run(function(){})}).throws(Error)
				spy()
			})
			oo("zing", function(){
				o(function(){oo.run()}).throws(Error)
				o(function(){oo.run(function(){})}).throws(Error)
				spy()
			})
			oo.run(function(results, stats){
				try {
					o(results).deepEquals([])
					o(stats).deepEquals({asyncSuccesses: 0, bailCount: 0, onlyCalledAt: []})
					if (spy.callCount !== 2) done("spy was called "+spy.callCount+" times, expected 2")
					else done()
				} catch (e) {
					done(e)
				}
			})
		})

		o("timing, test definition is synchronous, test are always async", function(done){
			var spy = o.spy()
			var oo = lib.new()
			oo.spec("spec", function(){
				oo("test", function(){spy(2)})
				spy(0)
			})
			oo.run(function(results){
				try {
					o(results).deepEquals([])
					o(spy.calls).deepEquals([
						{this: void 0, args: [0]},
						{this: void 0, args: [1]},
						{this: void 0, args: [2]}
					])
					done()
				} catch (e) {
					done(e)
				}
			})
			spy(1)
		})

		o.spec("o.only", function(){
			o("works", function(done) {
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
					})
					oo("skipped at last", function() {
						oo(true).equals(false)
					})
				})

				oo.run(function(results, stats) {
					try {
						var passed = results.map(function(r){return r.pass})
						var only = stats.onlyCalledAt.map(function(line){return line.indexOf("test-api.js") !== -1})
						o(passed).deepEquals([true])
						o(only).deepEquals([true])

						done()
					} catch (e) {
						done(e)
					}
				})
			})
			o("warns for every o.only() call", function(done) {
				var oo = lib.new()

				oo.metadata({file: "foo"})

				oo.spec("won't run", function() {
					oo("nope, skipped", function() {
						o(true).equals(false)
					})
				})

				oo.spec("first", function() {
					oo("skipped as well", function() {
						oo(true).equals(false)
					})
					oo.only(".only()", function() {
						oo(2).equals(2)
					})
					oo.only("another .only()", function(done) {
						done("that fails")
					})
				})

				oo.metadata({file: "bar"})

				oo("skipped as well", function() {
					oo(true).equals(false)
				})
				oo.only(".only()", function() {
					oo(2).equals(2)
				})
				oo.only("another .only()", function(done) {
					done("that fails")
				})

				oo.run(function(results, stats) {
					try{
						var passed = results.map(function(r){return r.pass})
						var only = stats.onlyCalledAt.map(function(line){return line.indexOf("test-api.js") !== -1})

						o(passed).deepEquals([true, false, true, false])
						o(only).deepEquals([true, true, true, true])

						done()
					} catch (e) {
						done(e)
					}
				})
			})
		})

		o("named suite", function(done) {
			var oo = lib.new("named suite")
			oo("test", function(){
				oo(true).equals(false)
			})
			oo.run(function(results) {
				try{
					o(results.length).equals(1)("results length")
					o(results[0].context).equals("named suite > test")
					done()
				} catch (e) {
					done(e)
				}
			})
		})

		o.spec("results", function() {
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
					try{
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
					} catch (e) {
						done(e)
					}
				})
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
						try {
							o(spyHookHook.callCount).equals(0)
							o(spyHookTest.callCount).equals(0)
							o(spyTestHook.callCount).equals(0)
							o(spyTestTest.callCount).equals(0)

							o({nestedThrows:nestedThrows}).deepEquals({nestedThrows: expectedTrows})

							done()
						} catch (e) {
							done(e)
						}
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
						try {
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
						} catch (e) {
							done(e)
						}
					})
				})
				o.spec("spies", function() {
					var supportsFunctionMutations = false;
					// eslint-disable-next-line no-empty, no-implicit-coercion
					try {supportsFunctionMutations = !!Object.defineProperties(function(){}, {name: {value: "a"},length: {value: 1}})} catch(_){}

					var supportsEval = false
					// eslint-disable-next-line no-eval, no-empty
					try {eval("supportsEval = true")} catch(e){}

					o("noop spy", function() {
						var oo = lib.new()
						var spy = oo.spy()

						o(spy.callCount).equals(0)
						o(spy.this).equals(undefined)
						o(spy.calls).deepEquals([])
						o(spy.args).deepEquals([])

						spy(1, 2)

						o(spy.callCount).equals(1)
						o(spy.this).equals(undefined)
						o(spy.args).deepEquals([1, 2])
						o(spy.calls).deepEquals([{this: undefined, args: [1, 2]}])

						spy.call(spy, 3, 4)

						o(spy.callCount).equals(2)
						o(spy.this).equals(spy)
						o(spy.args).deepEquals([3, 4])
						o(spy.calls).deepEquals([
							{this: undefined, args: [1, 2]},
							{this: spy, args: [3, 4]}
						])
					})

					o("spy wrapping", function() {
						var oo = lib.new()
						function view(children){
							this.drawn = true

							return {tag: "div", children: children}
						}
						var spy = oo.spy(view)
						var children = [""]
						var state = {}

						o(spy.callCount).equals(0)
						o(spy.this).equals(undefined)
						o(spy.calls).deepEquals([])
						o(spy.args).deepEquals([])

						var output = spy.call(state, children)

						o(spy.callCount).equals(1)
						o(spy.args.length).equals(1)
						o(spy.args[0]).deepEquals(children)
						o(spy.calls.length).equals(1)
						o(spy.calls[0]).deepEquals({this: state, args: [children]})
						o(state).deepEquals({drawn: true})
						o(output).deepEquals({tag: "div", children: children})

						if (supportsFunctionMutations || supportsEval) {
							o(spy.length).equals(1)
							// IE 11 functions don't have a `.name` unless set manually.
							if(view.name === "view") o(spy.name).equals("view")
						}
					})
					if (supportsFunctionMutations || supportsEval) o("anonymous spy", function(){
						// eslint-disable-next-line no-unused-vars
						var spy = o.spy(function(_a){})

						o(spy.name).equals("")("No name for the anonymous spy")
						o(spy.length).equals(1)("Spy length should be 1")
					})

				})
			})
			o("async callback sequence", function(finished) {
				var trail = o.spy()
				var oo = lib.new()

				oo.before(function(done) {
					trail("global before")
					callAsync(function(){
						trail("global before async")
						done()
					})
				})
				oo.after(function(done) {
					trail("global after")
					callAsync(function(){
						trail("global after async")
						done()
					})
				})
				oo.spec("dummy spec", function(){
					oo.before(function(done) {
						trail("spec before")
						callAsync(function(){
							trail("spec before async")
							done()
						})
					})
					oo.after(function(done) {
						trail("spec after")
						callAsync(function(){
							trail("spec after async")
							done()
						})
					})
					oo.beforeEach(function(done) {
						trail("spec beforeEach")
						callAsync(function(){
							trail("spec beforeEach async")
							done()
						})
					})
					oo.afterEach(function(done) {
						trail("spec afterEach")
						callAsync(function(){
							trail("spec afterEach async")
							done()
						})
					})

					oo("test1", function(done) {
						trail("test1")
						callAsync(function(){
							trail("test1 async")
							done()
						})
					})
					oo("test2", function(done) {
						trail("test2")
						callAsync(function(){
							trail("test2 async")
							done()
						})
					})
				})
				oo.run(function(results) {
					try {
						o(results).deepEquals([])
						o(trail.calls.map(function(call) {return call.args})).deepEquals([
							["global before"],
							["global before async"],
							["spec before"],
							["spec before async"],
							["spec beforeEach"],
							["spec beforeEach async"],
							["test1"],
							["test1 async"],
							["spec afterEach"],
							["spec afterEach async"],
							["spec beforeEach"],
							["spec beforeEach async"],
							["test2"],
							["test2 async"],
							["spec afterEach"],
							["spec afterEach async"],
							["spec after"],
							["spec after async"],
							["global after"],
							["global after async"],
						])
						finished()
					} catch (e) {
						finished(e)
					}
				})
			})
			o("successful done callbacks", function(finished){
				var oo = lib.new()
				oo("syncSuccess", function(done) {
					done()
				})
				oo("asyncSuccess", function(done) {
					callAsync(function(){
						done()
					})
				})
				oo.spec("tolerates nullish", function() {
					oo("syncSuccess null", function(done) {
						done(null)
					})
					oo("asyncSuccess null", function(done) {
						callAsync(function(){
							done(null)
						})
					})
					oo("syncSuccess undefined", function(done) {
						done(undefined)
					})
					oo("asyncSuccess undefined", function(done) {
						callAsync(function(){
							done(undefined)
						})
					})

				})
				oo.run(function(results, stats) {
					try {
						o(results).deepEquals([])
						o(stats).deepEquals({asyncSuccesses: 6, bailCount: 0, onlyCalledAt: []})
						finished()
					} catch (e) {
						finished(e)
					}
				})
			})
			o("unsuccessful done callbacks", function(finished){
				var oo = lib.new()
				oo.spec("sync fail string", function(){
					oo("", function(done) {
						done("")
					})
				})
				oo.spec("async fail string", function(){
					oo("", function(done) {
						callAsync(function(){
							done("")
						})
					})
				})
				oo.spec("sync fail string2", function(){
					oo("", function(done) {
						done("2")
					})
				})
				oo.spec("async fail string2", function(){
					oo("", function(done) {
						callAsync(function(){
							done("2")
						})
					})
				})
				oo.spec("sync fail true", function(){
					oo("", function(done) {
						done(true)
					})
				})
				oo.spec("async fail true", function(){
					oo("", function(done) {
						callAsync(function(){
							done(true)
						})
					})
				})
				oo.spec("sync fail false", function(){
					oo("", function(done) {
						done(false)
					})
				})
				oo.spec("async fail false", function(){
					oo("", function(done) {
						callAsync(function(){
							done(false)
						})
					})
				})
				oo.spec("sync fail 0", function(){
					oo("", function(done) {
						done(0)
					})
				})
				oo.spec("async fail 0", function(){
					oo("", function(done) {
						callAsync(function(){
							done(0)
						})
					})
				})
				oo.spec("sync fail 5", function(){
					oo("", function(done) {
						done(5)
					})
				})
				oo.spec("async fail 5", function(){
					oo("", function(done) {
						callAsync(function(){
							done(5)
						})
					})
				})
				oo.spec("sync fail Error", function(){
					oo("", function(done) {
						done(new Error)
					})
				})
				oo.spec("async fail Error", function(){
					oo("", function(done) {
						callAsync(function(){
							done(new Error)
						})
					})
				})

				oo.run(function(results, stats) {
					try {
						o(results.map(function(r){return r.pass})).deepEquals([
							false, false, false, false, false, false, false,
							false, false, false, false, false, false, false
						])
						o(stats).deepEquals({asyncSuccesses: 0, bailCount: 14, onlyCalledAt: []})
						finished()
					} catch (e) {
						finished(e)
					}
				})
			})
			o.spec("throwing in test context is recorded as a failure", function() {
				var oo
				o.beforeEach(function(){oo = lib.new()})
				o.afterEach(function(done) {
					oo.run(function(results) {
						try {
							o(results.length).equals(1)
							o(results[0].pass).equals(false)

							done()
						} catch (e) {
							done(e)
						}
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

			o.spec("o.timeout", function () {
				o("when using done()", function(done) {
					var oo = lib.new()
					var err
					// the success of this test is dependent on having the
					// oo() call three linew below this one
					try {throw new Error} catch(e) {err = e}
					if (err.stack) {
						var line = Number(err.stack.match(/:(\d+):/)[1])
						oo("", function(oodone) {
							oo.timeout(1)
							// eslint-disable-next-line no-constant-condition
							if (false) oodone()
						})
						oo.run(function(results) {
							try{
								o(results.length).equals(1)
								o(results[0].pass).equals(false)
								// todo test cleaned up results[0].error stack trace for the presence
								// of the timeout stack entry
								o(results[0].task.error instanceof Error).equals(true)
								o(oo.cleanStackTrace(results[0].task.error).indexOf("test-api.js:" + (line + 3) + ":")).notEquals(-1)

								done()
							} catch (e) {
								done(e)
							}
						})
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
						oo.run(function(results) {
							try{
								o(results.length).equals(1)
								o(results[0].pass).equals(false)
								o(results[0].task.error instanceof Error).equals(true)
								o(oo.cleanStackTrace(results[0].task.error).indexOf("test-api.js:" + (line + 3) + ":")).notEquals(-1)

								done()
							} catch (e) {
								done(e)
							}
						})
					} else {
						done()
					}
				})
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
						try{o(result.length).equals(0)
							o(oTimeout.callCount).equals(3)

							done()
						} catch (e) {
							done(e)
						}
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
						try{
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(new Date - t >= 10).equals(true)
							o(200 > new Date - t).equals(true)

							done()
						} catch (e) {
							done(e)
						}
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
						try {
							o(result.length).equals(0)
							done()
						} catch (e) {
							done(e)
						}
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
						try {
							o(results.length).equals(2)
							o(results[0].pass).equals(true)
							o(results[1].pass).equals(false)
							done()
						} catch (e) {
							done(e)
						}
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
						try {
							o(results.length).equals(4)
							o(results[0].pass).equals(true)
							o(results[1].pass).equals(false)
							o(results[2].pass).equals(true)
							o(results[3].pass).equals(false)
							done()
						} catch (e) {
							done(e)
						}
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
						try {
							o(results.length).equals(2)
							o(results[0].pass).equals(true)
							o(results[1].pass).equals(false)
							done()
						} catch (e) {
							done(e)
						}
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
						o(err.message).equals("`oodone()` should only be called once")
					})
					oo.run(function(results) {
						try {
							o(results.length).equals(0)
							done()
						} catch (e) {
							done(e)
						}
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
						o(err.message).equals("`oodone()` should only be called once")
					})
					oo.run(function(results) {
						try {
							o(results.length).equals(0)
							done()
						} catch (e) {
							done(e)
						}
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
						o(err.message).equals("`oodone()` should only be called once")
					})
					oo.run(function(results) {
						try {
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("bar")
							done()
						} catch (e) {
							done(e)
						}
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
						o(err.message).equals("`oodone()` should only be called once")
					})
					oo.run(function(results) {
						try {
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("bar")
							done()
						} catch (e) {
							done(e)
						}
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
						o(trace.indexOf("break\n") === -1).equals(true)
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
					try {
						o(results.length).equals(0)
						o(ran).equals(true)

						done()
					} catch (e) {
						done(e)
					}
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
						try {
							o(results.length).equals(2)
							o(results[1].message).equals("howdy\n\n"+results[0].message)
							o(results[1].pass).equals(false)

							done()
						} catch (e) {
							done(e)
						}
					})
				})
			})
		})
		o.spec("the done parser", function() {
			o("accepts non-English names", function(done) {
				var oo = lib.new()
				o(function() {
					oo("test", function(完了) {
						oo(true).equals(true)
						完了()
					})
					oo.run(function(results){
						try {
							o(results.length).equals(1)
							results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
							done()
						} catch (e) {
							done(e)
						}
					})
				}).notThrows(Error)
			})
			o("tolerates comments with an ES5 function expression and a timeout parameter", function(done) {
				var oo = lib.new()
				o(function() {
					oo("test", function(/*hey
				*/ /**/ //ho
						done /*hey
				*/ /**/ //huuu
						, timeout
					) {
						// eslint-disable-next-line no-constant-condition
						if (false) timeout(5)
						oo(true).equals(true)
						done()
					})
					oo.run(function(results){
						try {
							o(results.length).equals(1)
							results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
							done()
						} catch (e) {
							done(e)
						}
					})
				}).notThrows(Error)
			})
			/*eslint-disable no-eval*/
			o("tolerates comments with an ES5 function expression and no timeoout parameter, unix-style line endings", function(done) {
				var oo = lib.new()
				o(function() {
					oo("test", eval("(function(/*hey \n*/ /**/ //ho\n done /*hey \n	*/ /**/ //huuu\n) {oo(true).equals(true);done()})"))
					oo.run(function(results){
						try {
							o(results.length).equals(1)
							results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
							done()
						} catch (e) {
							done(e)
						}
					})
				}).notThrows(Error)
			})
			o("tolerates comments with an ES5 function expression and no timeoout parameter, windows-style line endings", function(done) {
				var oo = lib.new()
				o(function() {
					oo("test", eval("(function(/*hey \r\n*/ /**/ //ho\r\n done /*hey \r\n	*/ /**/ //huuu\r\n) {oo(true).equals(true);done()})"))
					oo.run(function(results){
						try {
							o(results.length).equals(1)
							results.forEach(function(result) {o(result.pass).equals(true)(stringify(result))})
							done()
						} catch (e) {
							done(e)
						}
					})
				}).notThrows(Error)
			})
			try {eval("(()=>{})()"); o.spec("with ES6 arrow functions", function() {
				function getCommentContent(f) {
					f = f.toString()
					return f.slice(f.indexOf("/*") + 2, f.lastIndexOf("*/"))
				}
				o("has no false positives 1", function(done){
					var oo = lib.new()
					o(function() {
						eval(getCommentContent(function(){/*
					oo(
						'Async test parser mistakenly identified 1st token after a parens to be `done` reference',
						done => {
							oo(false).equals(false)
							done()
						}
					)
				*/}))
						oo.run(function(results, stats){
							try {
								o(results.length).equals(1)
								o(stats.asyncSuccesses).equals(1)
								done()
							} catch (e) {
								done(e)
							}
						})
					}).notThrows(Error)
				})
				o("has no false positives 2", function(done){
					var oo = lib.new()
					o(function() {
						eval(getCommentContent(function(){/*
					oo(
						'Async test parser mistakenly identified 1st token after a parens to be `(done)` reference',
						(done) => {
							oo(false).equals(false)
							done()
						}
					)
				*/}))
						oo.run(function(results, stats){
							try {
								o(results.length).equals(1)
								o(stats.asyncSuccesses).equals(1)
								done()
							} catch (e) {
								done(e)
							}
						})
					}).notThrows(Error)
				})
				o("has no false negatives", function(){
					// eslint-disable-next-line no-unused-vars
					var oo = lib.new()
					o(function(){
						eval(getCommentContent(function(){/*
					oo(
						"Multiple references to the wrong thing doesn't fool the checker",
						done => {
							oo(oo).equals(oo)
							oo(oo).equals(oo)
						}
					)
				*/}))
					}).throws(Error)
				})
				o("has no false negatives 2", function(){
					// eslint-disable-next-line no-unused-vars
					var oo = lib.new()
					o(function(){
						eval(getCommentContent(function(){/*
					oo(
						"Multiple references to the wrong thing doesn't fool the checker",
						(done) => {
							oo(oo).equals(oo)
							oo(oo).equals(oo)
						}
					)
				*/}))
					}).throws(Error)
				})
				o("has no false negatives 3", function(){
					// eslint-disable-next-line no-unused-vars
					var oo = lib.new()
					o(function(){
						eval(getCommentContent(function(){/*
					oo(
						"Multiple references to the wrong thing doesn't fool the checker",
						(done)=>{
							oo(oo).equals(oo)
							oo(oo).equals(oo)
						}
					)
				*/}))
					}).throws(Error)
				})
				o("works with a literal that has parentheses but no spaces", function(done){
					var oo = lib.new()
					o(function() {
						eval(getCommentContent(function(){/*
					oo(
						"test",
						(done)=>{
							oo(false).equals(false)
							done()
						}
					)
				*/}))
						oo.run(function(results, stats){
							try {
								o(results.length).equals(1)
								o(stats.asyncSuccesses).equals(1)
								done()
							} catch (e) {
								done(e)
							}
						})
					}).notThrows(Error)
				})
				o("isn't fooled by comments", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("done /*hey*/ /**/ => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
				o("isn't fooled by comments (no parens)", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("done /*hey*/ /**/ => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
				o("isn't fooled by comments (with parens, no timeout, unix-style line endings)", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("(done /*hey*/ //ho \n/**/) => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
				o("isn't fooled by comments (with parens, no timeout, windows-style line endings)", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("(done /*hey*/ //ho \r\n/**/) => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
				o("isn't fooled by comments (with parens, with timeout, unix-style line endings)", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("(done /*hey*/ //ho \n/**/, timeout) => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
				o("isn't fooled by comments (with parens, with timeout, windows-style line endings)", function(){
					var oo = lib.new()
					o(function() {
						oo(
							"comments won't throw the parser off",
							eval("(done /*hey*/ //ho \r\n/**/, timeout) => {oo(threw).equals(false);done()}")
						)
						oo.run(function(){})
					}).notThrows(Error)
				})
			})} catch (e) {/*ES5 env, or no eval, ignore*/}
			/*eslint-enable no-eval*/
		})

		o.spec("satisfies / notSatisfies", function() {
			o.spec("satisfies", function() {
				o("passes with a string message", function(done) {
					var oo = lib.new()
					var getsFiveAndReturnsString = o.spy(function(value) {
						o(value).equals(5)
						return {pass: true, message: "Ok"}
					})
					oo("test", function() {
						oo(5).satisfies(getsFiveAndReturnsString)
					})
					oo.run(function(results) {
						try {
							o(getsFiveAndReturnsString.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(true)
							o(results[0].message).equals("Ok")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("passes when returning non-string", function(done) {
					var oo = lib.new()
					var getsFiveAndReturnsNumber = o.spy(function(value) {
						o(value).equals(5)
						return {pass: true, message: 5}
					})
					oo("test", function() {
						oo(5).satisfies(getsFiveAndReturnsNumber)
					})
					oo.run(function(results) {
						try {
							o(getsFiveAndReturnsNumber.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(true)
							o(results[0].message).equals("5")("stringified message")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("fails when throwing string", function(done) {
					var oo = lib.new()
					var getsFiveandThrowsString = o.spy(function(value) {

						o(value).equals(5)

						return {pass: false, message: "Not Ok"}
					})
					oo("test", function() {
						oo(5).satisfies(getsFiveandThrowsString)
					})
					oo.run(function(results) {
						try {
							o(getsFiveandThrowsString.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("Not Ok")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("fails when not passing with a number", function(done) {
					var oo = lib.new()
					var getsFiveandThrowsNumber = o.spy(function(value) {

						o(value).equals(5)

						return {pass: false, message: 5}
					})
					oo("test", function() {
						oo(5).satisfies(getsFiveandThrowsNumber)
					})
					oo.run(function(results) {
						try {
							o(getsFiveandThrowsNumber.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("5")("stringified message")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("bails when throwing error", function(done) {
					var oo = lib.new()
					var err = new Error("An Error")
					var getsFiveandThrowsError = o.spy(function(value) {

						o(value).equals(5)

						throw err
					})
					oo("test", function() {
						oo(5).satisfies(getsFiveandThrowsError)
					})
					oo.run(function(results, stats) {
						try {
							o(getsFiveandThrowsError.callCount).equals(1)
							o(results.length).equals(1)
							o(stats.bailCount).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("An Error")
							o(results[0].error).equals(err)

							done()
						} catch (e) {
							done(e)
						}
					})
				})
			})
			o.spec("notSatisfies", function() {
				o("fails when passing with a string", function(done) {
					var oo = lib.new()
					var getsFiveAndReturnsString = o.spy(function(value) {
						o(value).equals(5)
						return {pass: true, message: "Ok"}
					})
					oo("test", function() {
						oo(5).notSatisfies(getsFiveAndReturnsString)
					})
					oo.run(function(results) {
						try {
							o(getsFiveAndReturnsString.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("Ok")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("fails when passing with a non-string", function(done) {
					var oo = lib.new()
					var getsFiveAndReturnsNumber = o.spy(function(value) {
						o(value).equals(5)
						return {pass: true, message: 5}
					})
					oo("test", function() {
						oo(5).notSatisfies(getsFiveAndReturnsNumber)
					})
					oo.run(function(results) {
						try {o(getsFiveAndReturnsNumber.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("5")("stringified message")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("succeeds when not passing with a string", function(done) {
					var oo = lib.new()
					var getsFiveandThrowsString = o.spy(function(value) {

						o(value).equals(5)

						return {pass: false, message: "Not Ok"}
					})
					oo("test", function() {
						oo(5).notSatisfies(getsFiveandThrowsString)
					})
					oo.run(function(results) {
						try {
							o(getsFiveandThrowsString.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(true)
							o(results[0].message).equals("Not Ok")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("succeeds when not passing with a number", function(done) {
					var oo = lib.new()
					var getsFiveandThrowsNumber = o.spy(function(value) {

						o(value).equals(5)

						return {pass: false, message: 5}
					})
					oo("test", function() {
						oo(5).notSatisfies(getsFiveandThrowsNumber)
					})
					oo.run(function(results) {
						try {
							o(getsFiveandThrowsNumber.callCount).equals(1)
							o(results.length).equals(1)
							o(results[0].pass).equals(true)
							o(results[0].message).equals("5")("stringified message")

							done()
						} catch (e) {
							done(e)
						}
					})
				})
				o("bails when throwing error", function(done) {
					var oo = lib.new()
					var err = new Error("An Error")
					var getsFiveandThrowsError = o.spy(function(value) {

						o(value).equals(5)

						throw err
					})
					oo("test", function() {
						oo(5).notSatisfies(getsFiveandThrowsError)
					})
					oo.run(function(results, stats) {
						try {
							o(getsFiveandThrowsError.callCount).equals(1)
							o(stats).deepEquals({asyncSuccesses: 0, bailCount: 1, onlyCalledAt: []})
							o(results.length).equals(1)
							o(results[0].pass).equals(false)
							o(results[0].message).equals("An Error")
							o(results[0].error).equals(err)

							done()
						} catch (e) {
							done(e)
						}
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
					try {
						o(results.length).equals(1)
						o(results[0].pass).equals(false)

						o(before.callCount).equals(1)
						o(after.callCount).equals(1)
						o(beforeEach.callCount).equals(1)
						o(afterEach.callCount).equals(1)

						o(secondTest.callCount).equals(0)

						done()
					} catch (e) {
						done(e)
					}
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
					try {o(results.length).equals(1)
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
					} catch (e) {
						done(e)
					}
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
					try {
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
					} catch (e) {
						done(e)
					}
				})
			})
			o("throwing in the before hook causes the streaks of the spec not to run", function(done) {
				var after = o.spy()
				var beforeEach = o.spy()
				var afterEach = o.spy()

				var test = o.spy()

				var oo = lib.new()
				oo.before(function(){
					throw "bye..."
				})
				oo.after(after)
				oo.beforeEach(beforeEach)
				oo.afterEach(afterEach)

				oo("skipped", test)

				oo.run(function(results) {
					try {
						o(results.length).equals(1)
						o(results[0].pass).equals(false)

						o(after.callCount).equals(1)
						o(beforeEach.callCount).equals(0)
						o(afterEach.callCount).equals(0)

						o(test.callCount).equals(0)

						done()
					} catch (e) {
						done(e)
					}
				})
			})
			o("Throwing in a beforeEach hook hollows out the streak", function(done) {
				var oo = lib.new()
				var beforeOuter = o.spy()
				var afterOuter = o.spy()
				var beforeEachOuter = o.spy(function(){throw new Error()})
				var afterEachOuter = o.spy()
				var testOuter1 = o.spy()
				var testOuter2 = o.spy()

				var beforeInner = o.spy()
				var afterInner = o.spy()
				var beforeEachInner = o.spy()
				var afterEachInner = o.spy()
				var testInner1 = o.spy()
				var testInner2 = o.spy()

				oo.spec("outer", function() {

					oo.before(beforeOuter)
					oo.after(afterOuter)
					oo.beforeEach(beforeEachOuter)
					oo.afterEach(afterEachOuter)
					oo.spec("inner", function() {
						oo.before(beforeInner)
						oo.after(afterInner)
						oo.beforeEach(beforeEachInner)
						oo.afterEach(afterEachInner)
						oo("test1a", testInner1)
						oo("test1b", testInner2)
					})
					oo("test2a", testOuter1)
					oo("test2b", testOuter2)
				})
				oo.run(function(results, stats) {
					try {
						var passed = results.map(function(r) {return r.pass})

						o(passed).deepEquals([false, false])
						o(stats.bailCount).equals(2)("bailCount")

						o(beforeOuter.callCount).equals(1)("beforeOuter")
						o(afterOuter.callCount).equals(1)("afterOUter")
						o(beforeInner.callCount).equals(1)("beforeInner")
						o(beforeOuter.callCount).equals(1)("beforeOuter")


						o(beforeEachOuter.callCount).equals(2)("afterEachOUter")
						o(afterEachOuter.callCount).equals(2)("afterEachOUter")
						o(beforeEachInner.callCount).equals(0)("beforeEachInner")
						o(afterEachInner.callCount).equals(0)("afterEachInner")

						o(testOuter1.callCount).equals(0)("testOuter1")
						o(testOuter2.callCount).equals(0)("testOuter2")
						o(testInner1.callCount).equals(0)("testInner1")
						o(testInner2.callCount).equals(0)("testInner2")

						done()
					} catch (e) {
						done(e)
					}
				})
			})
		})

		o.spec("context", function() {
			o("getting throws where illegal, works in tests", function(done){
				var oo = lib.new()
				o(oo.metadata).throws(Error)
				oo.spec("spec", function() {
					o(oo.metadata).throws(Error)
					oo.before(function(){
						o(oo.metadata()).deepEquals({file: void 0, name: "o.before*( spec )"})
					})
					oo("test", function() {
						o(oo.metadata()).deepEquals({file: void 0, name: "spec > test"})
						oo().satisfies(function(){
							o(oo.metadata()).deepEquals({file: void 0, name: "spec > test"})
							return {pass: true}
						})
					})
				})
				oo.run(function(results) {
					try {
						o(results.map(function(r) {return {pass: r.pass}})).deepEquals([{pass: true}])
						done()
					} catch (e) {
						done(e)
					}
				})
			})
			o("setting works at root, throws elsewhere", function(done) {
				var oo = lib.new()
				var spy = o.spy()
				oo.metadata({file: "foo"})
				oo.spec("spec", function(){
					spy()
					o(function(){oo.metadata({file: "bar"})}).throws(Error)
				})
				oo("test", function(){
					spy()
					o(oo.metadata()).deepEquals({file: "foo", name: "test"})
					o(function(){oo.metadata({file: "bar"})}).throws(Error)
				})
				oo.run(function(results, stats) {
					try {
						o(spy.callCount).equals(2)
						o(results).deepEquals([])
						o(stats).deepEquals({asyncSuccesses: 0, bailCount: 0, onlyCalledAt: []})
						done()
					} catch (e) {
						done(e)
					}
				})
			})
		})
	}
})

o.spec("reporting", function() {
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
				{pass: false, error: makeError("hey"), message: "hey", task: {context: "ctxt"}}
			]
			errCount = oo.report(results)

			o(errCount).equals(1)
			o(console.log.callCount).equals(2)
			o(console.error.callCount).equals(1)

			results = [
				{pass: false, error: makeError("hey"), message: "hey", task: {context: "ctxt"}},
				{pass: true},
				{pass: false, error: makeError("ho"), message: "ho", task: {context: "ctxt"}}
			]
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

o.spec("legacy argument timeout", function() {
	var consoleError
	o.beforeEach(function(){
		consoleError = console.error
		console.error = o.spy()
	})
	o.afterEach(function(){
		console.error = consoleError
	})
	o("works, but warns", function(done) {
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
			oo.run(function(results) {
				try {
					o(results.length).equals(1)
					o(results[0].pass).equals(false)
					// todo test cleaned up results[0].error stack trace for the presence
					// of the timeout stack entry
					o(results[0].task.error instanceof Error).equals(true)
					o(oo.cleanStackTrace(results[0].task.error).indexOf("test-api.js:" + (line + 3) + ":")).notEquals(-1)
					o(console.error.callCount).equals(1)
					o(console.error.args[0] instanceof Error).equals(true)
					o(console.error.args[0].message).equals("`timeout()` as a test argument has been deprecated, use `o.timeout()`")

					done()
				} catch (e) {
					done(e)
				}
			})
		} else {
			done()
		}
	})
})

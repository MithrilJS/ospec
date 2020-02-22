"use strict"


;(function(m) {
if (typeof module !== "undefined") module["exports"] = m()
else window.o = m()
})(function init(name) {
	// # Setup
	// const
	var spec = new Spec()
	var subjects = []
	var hasProcess = typeof process === "object", hasOwn = ({}).hasOwnProperty
	var only = []
	var ospecFileName = getStackName(ensureStackTrace(new Error), /[\/\\](.*?):\d+:\d+/)

	// stack-managed globals
	var globalBail
	var globalContext = spec
	var globalDepth = 1
	var globalTest = null
	var globalTimeout = noTimeoutRightNow
	var asyncTimeoutPendingResolution = 0

	if (name != null) spec.children[name] = globalContext = new Spec()

	// Shared state, set only once, but initialization is delayed
	var results, start, timeoutStackName

	// # Task runner helpers and constructors
	var stack = 0
	var nextTickish = hasProcess
		? process.nextTick
		: function fakeFastNextTick(next) {
			if (stack++ < 5000) next()
			else setTimeout(next, stack = 0)
		}

	function Spec() {
		this.before = []
		this.beforeEach = []
		this.after = []
		this.afterEach = []
		this.specTimeout = null
		this.customAssert = null
		this.children = {}
	}

	function Task(fn, err, hookName) {
		// This test needs to be here rather than in `o("name", test(){})`
		// in order to also cover nested hooks.
		// `err` is null for internal tasks that can be defined at any time.
		if (isRunning() && err != null) throw new Error("Test definitions and hooks shouldn't be nested. To group tests, use 'o.spec()'.")
		this.fn = fn
		this.err = err
		this.hookName = hookName
		this.depth = globalDepth
	}

	function isInternal(task) {
		return task.err == null
	}
	function isRunning() {return results != null}

	function ensureStackTrace(error) {
		// mandatory to get a stack in IE 10 and 11 (and maybe other envs?)
		if (error.stack === undefined) try { throw error } catch(e) {return e}
		else return error
	}

	function getStackName(e, exp) {
		return e.stack && exp.test(e.stack) ? e.stack.match(exp)[1] : null
	}

	function hook(name) {
		return function(predicate) {
			if (globalContext[name].length > 0) throw new Error("Attempt to register o." + name + "() more than once. A spec can only have one hook of each kind.")
			globalContext[name][0] = new Task(predicate, ensureStackTrace(new Error), name)
		}
	}

	function noTimeoutRightNow() {
		throw new Error("o.timeout must be called snchronously from within a test definition or a hook.")
	}

	function unique(subject) {
		if (hasOwn.call(globalContext.children, subject)) {
			console.warn("A test or a spec named '" + subject + "' was already defined.")
			while (hasOwn.call(globalContext.children, subject)) subject += "*"
		}
		return subject
	}

	// # API
	function o(subject, predicate) {
		if (predicate === undefined) {
			if (!isRunning()) throw new Error("Assertions should not occur outside test definitions.")
			return new Assertion(subject)
		} else {
			subject = String(subject)
			globalContext.children[unique(subject)] = new Task(predicate, ensureStackTrace(new Error))
		}
	}

	o.before = hook("before")
	o.after = hook("after")
	o.beforeEach = hook("beforeEach")
	o.afterEach = hook("afterEach")

	o.specTimeout = function (t) {
		if (isRunning()) throw new Error("o.specTimeout() can only be called before o.run().")
		if (globalContext.specTimeout != null) throw new Error("A default timeout has already been defined in this context.")
		if (typeof t !== "number") throw new Error("o.specTimeout() expects a number as argument.")
		globalContext.specTimeout = t
	}

	o.new = init

	o.spec = function(subject, predicate) {
		// stack managed globals
		var parent = globalContext
		globalContext = globalContext.children[unique(subject)] = new Spec()
		globalDepth++
		predicate()
		globalDepth--
		globalContext = parent
	}

	o.only = function(subject, predicate, silent) {
		if (!silent) console.log(
			highlight("/!\\ WARNING /!\\ o.only() mode") + "\n" + o.cleanStackTrace(ensureStackTrace(new Error)) + "\n",
			cStyle("red"), ""
		)
		only.push(predicate)
		o(subject, predicate)
	}

	o.spy = function(fn) {
		var spy = function() {
			spy.this = this
			spy.args = [].slice.call(arguments)
			spy.calls.push({this: this, args: spy.args})
			spy.callCount++

			if (fn) return fn.apply(this, arguments)
		}
		if (fn)
			Object.defineProperties(spy, {
				length: {value: fn.length},
				name: {value: fn.name}
			})
		spy.args = []
		spy.calls = []
		spy.callCount = 0
		return spy
	}

	o.cleanStackTrace = function(error) {
		// For IE 10+ in quirks mode, and IE 9- in any mode, errors don't have a stack
		if (error.stack == null) return ""
		var i = 0, header = error.message ? error.name + ": " + error.message : error.name, stack
		// some environments add the name and message to the stack trace
		if (error.stack.indexOf(header) === 0) {
			stack = error.stack.slice(header.length).split(/\r?\n/)
			stack.shift() // drop the initial empty string
		} else {
			stack = error.stack.split(/\r?\n/)
		}
		if (ospecFileName == null) return stack.join("\n")
		// skip ospec-related entries on the stack
		while (stack[i] != null && stack[i].indexOf(ospecFileName) !== -1) i++
		// now we're in user code (or past the stack end)
		return stack[i]
	}

	o.timeout = function(n) {
		globalTimeout(n)
	}

	// # Test runner
	o.run = function(reporter) {
		results = []
		start = new Date

		var finalizer = new Task(function() {
			setTimeout(function () {
				timeoutStackName = getStackName({stack: o.cleanStackTrace(ensureStackTrace(new Error))}, /([\w \.]+?:\d+:\d+)/)
				if (typeof reporter === "function") reporter(results)
				else {
					var errCount = o.report(results)
					if (hasProcess && errCount !== 0) process.exit(1) // eslint-disable-line no-process-exit
				}
			})
		}, null)

		runSpec(spec, [], [], finalizer, 200 /*default timeout delay*/)

		function runSpec(spec, beforeEach, afterEach, finalize, defaultDelay) {
			var bailed = false
			if (spec.specTimeout) defaultDelay = spec.specTimeout

			// stack-managed globals

			var previousBail = globalBail
			globalBail = function() {bailed = true}


			var restoreStack = new Task(function() {
				globalBail = previousBail
			})
			// /stack-managed globals

			beforeEach = [].concat(
				beforeEach,
				spec.beforeEach
			)
			afterEach = [].concat(
				spec.afterEach,
				afterEach
			)

			series(
				[].concat(
					spec.before,
					Object.keys(spec.children).reduce(function(tasks, key) {
						if (
							// If in `only` mode, skip the tasks that are not flagged to run.
							only.length === 0
							|| only.indexOf(spec.children[key].fn) !== -1
							// Always run specs though, in case there are `only` tests nested in there.
							|| !(spec.children[key] instanceof Task)
						) {
							tasks.push(new Task(function(done) {
								if (bailed) return done()
								o.timeout(Infinity)
								subjects.push(key)
								var popSubjects = new Task(function pop() {subjects.pop(), done()}, null)
								if (spec.children[key] instanceof Task) {
									// this is a test
									series(
										[].concat(beforeEach, spec.children[key], afterEach, popSubjects),
										defaultDelay
									)
								} else {
									// a spec...
									runSpec(spec.children[key], beforeEach, afterEach, popSubjects, defaultDelay)
								}
							}, null))
						}
						return tasks
					}, []),
					spec.after,
					restoreStack,
					finalize
				),
				defaultDelay
			)
		}

		function series(tasks, defaultDelay) {
			var cursor = 0
			next()

			function next() {
				if (cursor === tasks.length) return

				var task = tasks[cursor++]
				var fn = task.fn
				var isHook = task.hookName != null
				var metadata = globalTest = {
					context: subjects.join(" > "),
					error: task.err
				}
				var timeout, delay = defaultDelay, s = new Date
				var isDone = false
				var isAsync = false
				var isFinalized = false
				// reuse `next` as a private sentinel. A default of `undefined`
				// derails the `doneError === e` test at the end of this function
				var doneError = next
				var arg

				globalTimeout = function timeout (t) {
					if (typeof t !== "number") throw new Error("timeout() and o.timeout() expect a number as argument.")
					delay = t
				}

				if (isHook) {
					globalTest.context = "o." + task.hookName + Array.apply(null, {length: task.depth}).join("*") + "( " + globalTest.context + " )"
				}
				// public API, may only be called once from use code (or after returned Promise resolution)
				function done(err) {
					if (!isDone) isDone = true
					else throw new Error("'" + arg + "()' should only be called once.")
					if (isAsync && timeout === undefined) {
						asyncTimeoutPendingResolution--
						console.warn(
							metadata.context
							+ "\n# elapsed: " + Math.round(new Date - s)
							+ "ms, expected under " + delay + "ms\n"
							+ o.cleanStackTrace(task.err))
					}
					if (!isFinalized) finalize(err, arguments.length !== 0, false)
				}
				// for internal use only
				function finalize(err, threw, isTimeout) {
					if (isFinalized) {
						throw new Error("Multiple finalization")
					}
					isFinalized = true
					if (threw) {
						if (err instanceof Error) fail(new Assertion().result, err.message, err)
						else fail(new Assertion().result, String(err), null)
						if (!isTimeout) globalBail()
					}
					if (timeout !== undefined) timeout = clearTimeout(timeout)
					if (isAsync) {
						next()
					} else nextTickish(next)
				}
				function startTimer() {
					timeout = setTimeout(function() {
						timeout = undefined
						asyncTimeoutPendingResolution++
						finalize("async test timed out after " + delay + "ms\nWarning: assertions starting with `???` may not be properly labelled", true, true)
					}, Math.min(delay, 2147483647))
				}
				try {
					if (fn.length > 0) {
						var body = fn.toString()
						// Don't change the RegExp by hand, it is generated by
						// `scripts/build-done-parser.js`.
						// If needed, update the script and paste its output here.
						arg = (body.match(/^(?:(?:function(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*(?:\b[^\s(\/]+(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*)?)?\((?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*)?([^\s{[),=\/]+)/) || []).pop()
						if (body.indexOf(arg) === body.lastIndexOf(arg)) {
							doneError = new Error
							doneError.stack = "'" + arg + "()' should be called at least once\n" + o.cleanStackTrace(task.err)
							throw doneError
						}
						fn(done, globalTimeout)
						// This may already be undefined if done() was called synchronously
						if (!isFinalized) {
							isAsync = true
							startTimer()
						}
					} else {
						var p = fn()
						if (p && p.then) {
							// use `done`, not `finalize` here to defend against badly behaved thenables
							p.then(function() { done() }, done)
							// This may already be undefined if done() was called synchronously in a
							// non-promise thenable
							if (!isFinalized) {
								isAsync = true
								startTimer()
							}
						} else {
							finalize(null, false, false)
						}
					}
				}
				catch (e) {
					if (isInternal(task) || e === doneError) throw e
					else finalize(e, true, false)
				}
				globalTimeout = noTimeoutRightNow
			}
		}
	}
	// #Assertions
	function Assertion(value) {
		this.value = value
		this.result = {
			pass: null,
			context: (asyncTimeoutPendingResolution === 0 ? "" : "??? ") + globalTest.context,
			message: "Incomplete assertion in the test definition starting at...",
			error: globalTest.error, testError: globalTest.error
		}
		results.push(this.result)
	}

	function plainAssertion(verb, compare) {
		return function(self, value) {
			var success = compare(self.value, value)
			var message = serialize(self.value) + "\n  " + verb + "\n" + serialize(value)
			if (success) succeed(self.result, message)
			else fail(self.result, message)
		}
	}

	function define(name, assertion) {
		Assertion.prototype[name] = function assert(value) {
			var self = this
			assertion(self, value)
			return function(message) {
				if (!self.result.pass) {
					self.result.message = message + "\n\n" + self.result.message
				}
			}
		}
	}

	define("equals", plainAssertion("should equal", function(a, b) {return a === b}))
	define("notEquals", plainAssertion("should not equal", function(a, b) {return a !== b}))
	define("deepEquals", plainAssertion("should deep equal", deepEqual))
	define("notDeepEquals", plainAssertion("should not deep equal", function(a, b) {return !deepEqual(a, b)}))
	define("throws", plainAssertion("should throw a", throws))
	define("notThrows", plainAssertion("should not throw a", function(a, b) {return !throws(a, b)}))
	define("satisfies", function satisfies(self, check) {
		try {
			succeed(self.result, String(check(self.value)))
		} catch (e) {
			if (e instanceof Error) fail(self.result, e.message, e)
			else fail(self.result, String(e))
		}
	})
	define("notSatisfies", function notSatisfies(self, check) {
		try {
			fail(self.result, String(check(self.value)))
		} catch (e) {
			if (e instanceof Error) succeed(self.result, e.message, e)
			else succeed(self.result, String(e))
		}
	})

	function isArguments(a) {
		if ("callee" in a) {
			for (var i in a) if (i === "callee") return false
			return true
		}
	}

	function deepEqual(a, b) {
		if (a === b) return true
		if (a === null ^ b === null || a === undefined ^ b === undefined) return false // eslint-disable-line no-bitwise
		if (typeof a === "object" && typeof b === "object") {
			var aIsArgs = isArguments(a), bIsArgs = isArguments(b)
			if (a.constructor === Object && b.constructor === Object && !aIsArgs && !bIsArgs) {
				for (var i in a) {
					if ((!(i in b)) || !deepEqual(a[i], b[i])) return false
				}
				for (var i in b) {
					if (!(i in a)) return false
				}
				return true
			}
			if (a.length === b.length && (a instanceof Array && b instanceof Array || aIsArgs && bIsArgs)) {
				var aKeys = Object.getOwnPropertyNames(a), bKeys = Object.getOwnPropertyNames(b)
				if (aKeys.length !== bKeys.length) return false
				for (var i = 0; i < aKeys.length; i++) {
					if (!hasOwn.call(b, aKeys[i]) || !deepEqual(a[aKeys[i]], b[aKeys[i]])) return false
				}
				return true
			}
			if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
			if (typeof Buffer === "function" && a instanceof Buffer && b instanceof Buffer) {
				for (var i = 0; i < a.length; i++) {
					if (a[i] !== b[i]) return false
				}
				return true
			}
			if (a.valueOf() === b.valueOf()) return true
		}
		return false
	}

	function throws(a, b){
		try{
			a()
		}catch(e){
			if(typeof b === "string"){
				return (e.message === b)
			}else{
				return (e instanceof b)
			}
		}
		return false
	}

	function succeed(result, message, error) {
		result.pass = true
		result.message = message
		// for notSatisfies, use the testError for other passing assertions
		if (error != null) result.error = error
	}

	function fail(result, message, error) {
		result.pass = false
		result.message = message
		result.error = error != null ? error : ensureStackTrace(new Error)
	}

	function serialize(value) {
		if (hasProcess) return require("util").inspect(value) // eslint-disable-line global-require
		if (value === null || (typeof value === "object" && !(value instanceof Array)) || typeof value === "number") return String(value)
		else if (typeof value === "function") return value.name || "<anonymous function>"
		try {return JSON.stringify(value)} catch (e) {return String(value)}
	}

	// Reporter helpers
	var colorCodes = {
		red: "31m",
		red2: "31;1m",
		green: "32;1m"
	}

	function highlight(message, color) {
		var code = colorCodes[color] || colorCodes.red;
		return hasProcess ? (process.stdout.isTTY ? "\x1b[" + code + message + "\x1b[0m" : message) : "%c" + message + "%c "
	}

	function cStyle(color, bold) {
		return hasProcess||!color ? "" : "color:"+color+(bold ? ";font-weight:bold" : "")
	}

	o.report = function (results) {
		var errCount = 0
		for (var i = 0, r; r = results[i]; i++) {
			if (r.pass == null) {
				r.testError.stack = r.message + "\n" + o.cleanStackTrace(r.testError)
				r.testError.message = r.message
				throw r.testError
			}
			if (!r.pass) {
				var stackTrace = o.cleanStackTrace(r.error)
				var couldHaveABetterStackTrace = !stackTrace || timeoutStackName != null && stackTrace.indexOf(timeoutStackName) !== -1
				if (couldHaveABetterStackTrace) stackTrace = r.testError != null ? o.cleanStackTrace(r.testError) : r.error.stack || ""
				console.error(
					(hasProcess ? "\n" : "") +
					highlight(r.context + ":", "red2") + "\n" +
					highlight(r.message, "red") +
					(stackTrace ? "\n" + stackTrace + "\n" : ""),

					cStyle("black", true), "", // reset to default
					cStyle("red"), cStyle("black")
				)
				errCount++
			}
		}
		var pl = results.length === 1 ? "" : "s"
		var resultSummary = (errCount === 0) ?
			highlight((pl ? "All " : "The ") + results.length + " assertion" + pl + " passed", "green"):
			highlight(errCount + " out of " + results.length + " assertion" + pl + " failed", "red2")
		var runningTime = " in " + Math.round(Date.now() - start) + "ms"

		console.log(
			(hasProcess ? "––––––\n" : "") +
			(name ? name + ": " : "") + resultSummary + runningTime,
			cStyle((errCount === 0 ? "green" : "red"), true), ""
		)
		return errCount
	}
	return o
})

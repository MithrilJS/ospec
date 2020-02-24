"use strict"
/*
Ospec is made of four parts:

1. a test definition API That creates a spec/tests tree
2. a test runner that walks said spec tree
3. an assertion API that populates a results array
4. a reporter which presents the results

The tepmoral sequence at run time is 1 then (2 and 3), then 4

The various sections (and sub-sections thereof) share information through stack-managed globals
which are enumerated in the "Setup" section below.

there are three kind of data structures, that reflect the above segregation:

1. Specs, that group other specs and tasks
2. Tasks, that represent hooks and tests, and internal logic
3. Assertions which end up in the results array.

At run-time, the specs are converted to lists of task (one per entry in the spec)
In each of these tasks:
- sub-specs receive the same treament as their parent, when their turn comes.
- tests are also turned into lists of tasks [...beforeEach, test, ...afterEach]
*/


;(function(m) {
if (typeof module !== "undefined") module["exports"] = m()
else window.o = m()
})(function init(name) {
	// # Setup
	// const
	var hasProcess = typeof process === "object", hasOwn = ({}).hasOwnProperty
	var hasSuiteName = arguments.length !== 0
	var only = []
	var ospecFileName = getStackName(ensureStackTrace(new Error), /[\/\\](.*?):\d+:\d+/)
	var spec = new Spec()
	var subjects = []

	// stack-managed globals
	var globalBail
	var globalContext = spec
	var globalDepth = 1
	var globalDoneError
	var globalTestOrHook = null
	var globalTimeout = noTimeoutRightNow
	var globalTimedOutAndPendingResolution = 0

	// Shared state, set only once, but initialization is delayed
	var results, timeoutStackName

	// # General utils
	function isRunning() {return results != null}

	function ensureStackTrace(error) {
		// mandatory to get a stack in IE 10 and 11 (and maybe other envs?)
		if (error.stack === undefined) try { throw error } catch(e) {return e}
		else return error
	}

	function getStackName(e, exp) {
		return e.stack && exp.test(e.stack) ? e.stack.match(exp)[1] : null
	}

	function noTimeoutRightNow() {
		throw new Error("`o.timeout()` must be called synchronously from within a test definition or a hook.")
	}
	function timeoutParamDeprecationNotice(n) {
		console.error(new Error("`timeout()` as a test argument has been deprecated, use `o.timeout()`"))
		o.timeout(n)
	}

	// # Spec definition
	function Spec() {
		this.before = []
		this.beforeEach = []
		this.after = []
		this.afterEach = []
		this.specTimeout = null
		this.customAssert = null
		this.children = {}
	}

	// Used for both user-defined tests and internal book keeping
	// Internal tasks don't have an `err`. `hookName` is only defined
	// for hooks
	function Task(fn, err, hookName) {
		// This test needs to be here rather than in `o("name", test(){})`
		// in order to also cover nested hooks.
		// `err` is null for internal tasks that can be defined at any time.
		if (isRunning() && err != null) throw new Error("Test definitions and hooks shouldn't be nested. To group tests, use 'o.spec()'.")
		this.fn = fn
		this.error = err
		this.context = null
		this.hookName = hookName
		this.depth = globalDepth
	}

	function hook(name) {
		return function(predicate) {
			if (globalContext[name].length > 0) throw new Error("Attempt to register o." + name + "() more than once. A spec can only have one hook of each kind.")
			globalContext[name][0] = new Task(predicate, ensureStackTrace(new Error), name)
		}
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
			globalContext.children[unique(subject)] = new Task(predicate, ensureStackTrace(new Error), null)
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
		var name = unique(subject)
		globalContext = globalContext.children[name] = new Spec()
		globalDepth++
		try {
			predicate()
		} catch(e) {
			globalContext.children[name] = new Task(function(){}, null, null)
			globalContext.children[name + "  >>> BAILED OUT <<<"] = new Task(function(){
				o().satisfies(function(){throw e})
				results.bailCount++
			}, ensureStackTrace(new Error), null)
		}
		globalDepth--
		globalContext = parent
	}

	o.only = function(subject, predicate) {
		if (only.length === 0) {
			console.log(
				highlight("/!\\ WARNING /!\\ o.only() mode") + "\n" + o.cleanStackTrace(ensureStackTrace(new Error)) + "\n",
				cStyle("red"), ""
			)
		}
		only.push(predicate)
		o(subject, predicate)
	}

	o.cleanStackTrace = function(error) {
		// For IE 10+ in quirks mode, and IE 9- in any mode, errors don't have a stack
		if (error.stack == null) return ""
		var header = error.message ? error.name + ": " + error.message : error.name, stack
		// some environments add the name and message to the stack trace
		if (error.stack.indexOf(header) === 0) {
			stack = error.stack.slice(header.length).split(/\r?\n/)
			stack.shift() // drop the initial empty string
		} else {
			stack = error.stack.split(/\r?\n/)
		}
		if (ospecFileName == null) return stack.join("\n")
		// skip ospec-related entries on the stack
		return stack.filter(function(line) { return line.indexOf(ospecFileName) === -1 }).join("\n")
	}

	o.timeout = function(n) {
		globalTimeout(n)
	}

	// # Test runner
	var stack = 0
	var nextTickish = hasProcess
		? process.nextTick
		: function fakeFastNextTick(next) {
			if (stack++ < 5000) next()
			else setTimeout(next, stack = 0)
		}

	function validateDone(fn, task) {
		var body = fn.toString()
		// Don't change the RegExp by hand, it is generated by
		// `scripts/build-done-parser.js`.
		// If needed, update the script and paste its output here.

		var arg = (body.match(/^(?:(?:function(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*(?:\b[^\s(\/]+(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*)?)?\((?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*)?([^\s{[),=\/]+)/) || []).pop()
		if (arg) {
			if(body.indexOf(arg) === body.lastIndexOf(arg)) {
				globalDoneError = new Error
				globalDoneError.stack = "'" + arg + "()' should be called at least once\n" + o.cleanStackTrace(task.error)
				throw globalDoneError
			}
		} else {
			console.warn("we couldn't determine the `done` callback name, please file a bug report at https://github.com/mithriljs/ospec/issues")
			arg = "done"
		}
		return "`" + arg + "()` should only be called once."
	}

	o.run = function(reporter) {
		results = []
		results.bailCount = 0
		results.asyncSuccesses = 0

		if (hasSuiteName) {
			var parent = new Spec()
			parent.children[name] = spec
		}

		var finalize = new Task(function() {
			// always async for consistent external behavior
			// otherwise, an async test would release Zalgo
			// https://blog.izs.me/2013/08/designing-apis-for-asynchrony
			setTimeout(function () {
				timeoutStackName = getStackName({stack: o.cleanStackTrace(ensureStackTrace(new Error))}, /([\w \.]+?:\d+:\d+)/)
				if (typeof reporter === "function") reporter(results)
				else {
					var errCount = o.report(results)
					if (hasProcess && errCount !== 0) process.exit(1) // eslint-disable-line no-process-exit
				}
			})
		}, null, null)

		runSpec(hasSuiteName ? parent : spec, [], [], finalize, 200 /*default timeout delay*/)

		function runSpec(spec, beforeEach, afterEach, finalize, defaultDelay) {
			var bailed = false
			if (spec.specTimeout) defaultDelay = spec.specTimeout

			// stack-managed globals
			var previousBail = globalBail
			globalBail = function() {bailed = true; results.bailCount++}
			var restoreStack = new Task(function() {
				globalBail = previousBail
			}, null, null)

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
								var popSubjects = new Task(function pop() {subjects.pop(), done()}, null, null)
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
							}, null, null))
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

		// Executes a list of tasks in series.
		// This is quite convoluted because we handle both sync and async tasks.
		// Async tasks can either use a legacy `done(error?)` API, or return a
		// thenable, which may or may not behave like a Promise
		function series(tasks, defaultDelay) {
			var cursor = 0
			next()

			function next() {
				if (cursor === tasks.length) return

				// const
				var task = tasks[cursor++]
				var fn = task.fn
				var isHook = task.hookName != null
				var isInternal = task.error == null
				var taskStartTime = new Date

				// let
				var delay = defaultDelay
				var doneCalledTwiceMessage
				var isAsync = false
				var isDone = false
				var isFinalized = false
				var timeout

				// reuse `next` as a private sentinel. A default of `undefined`
				// derails the `e === doneError` test at the end of this function.
				// `globalDoneError` may be overwritten in the `validateDone()` helper.
				globalDoneError = next

				if (!isInternal) {
					globalTestOrHook = task
					task.context = subjects.join(" > ")
					if (isHook) {
						task.context = "o." + task.hookName + Array.apply(null, {length: task.depth}).join("*") + "( " + task.context + " )"
					}
				}
				globalTimeout = function timeout (t) {
					if (typeof t !== "number") throw new Error("timeout() and o.timeout() expect a number as argument.")
					delay = t
				}

				try {
					if (fn.length > 0) {
						doneCalledTwiceMessage = validateDone(fn, task)
						fn(done, timeoutParamDeprecationNotice)
					} else {
						var p = fn()
						if (p && p.then) {
							// Use `done`, not `finalize` here to defend against badly behaved thenables.
							// Let it crash if `then()` doesn't work as expected.
							doneCalledTwiceMessage = "A thenable should only be resolved once."
							p.then(function() { done() }, done)
						} else {
							finalize(null, false, false)
						}
					}
					if (!isFinalized) {
						// done() hasn't been called synchronously
						isAsync = true
						startTimer()
					}
				}
				catch (e) {
					if (isInternal || e === globalDoneError) throw e
					else finalize(e, true, false)
				}
				globalTimeout = noTimeoutRightNow

				// public API, may only be called once from user code (or after the resolution
				// of a thenable that's been returned at the end of the test)
				function done(err) {
					if (isDone) throw new Error(doneCalledTwiceMessage)
					isDone = true
					if (isAsync && timeout === undefined) {
						globalTimedOutAndPendingResolution--
						console.warn(
							task.context
							+ "\n# elapsed: " + Math.round(new Date - taskStartTime)
							+ "ms, expected under " + delay + "ms\n"
							+ o.cleanStackTrace(task.error))
					}
					if (!isFinalized) finalize(err, arguments.length !== 0, false)
				}
				// called only for async tests
				function startTimer() {
					timeout = setTimeout(function() {
						timeout = undefined
						globalTimedOutAndPendingResolution++
						finalize("async test timed out after " + delay + "ms\nWarning: assertions starting with `???` may not be properly labelled", true, true)
					}, Math.min(delay, 0x7fffffff))
				}
				// for internal use only
				function finalize(err, threw, isTimeout) {
					if (isFinalized) {
						// failsafe for hacking, should never happen in released code
						throw new Error("Multiple finalization")
					}
					isFinalized = true

					// temporary, for the "old style count" report
					if (isAsync && err == null && task.error != null && !isTimeout) {results.asyncSuccesses++}

					if (threw) {
						if (err instanceof Error) fail(new Assertion().i, err.message, err)
						else fail(new Assertion().i, String(err), null)
						if (!isTimeout) {globalBail()}
					}
					if (timeout !== undefined) timeout = clearTimeout(timeout)
					if (isAsync) {
						next()
					} else nextTickish(next)
				}
			}
		}
	}

	// #Assertions
	function Assertion(value) {
		this.value = value
		this.i = results.length
		results.push({
			pass: null,
			context: (globalTimedOutAndPendingResolution === 0 ? "" : "??? ") + globalTestOrHook.context,
			message: "Incomplete assertion in the test definition starting at...",
			error: globalTestOrHook.error, testError: globalTestOrHook.error
		})
	}

	function plainAssertion(verb, compare) {
		return function(self, value) {
			var success = compare(self.value, value)
			var message = serialize(self.value) + "\n  " + verb + "\n" + serialize(value)
			if (success) succeed(self.i, message, null)
			else fail(self.i, message, null)
		}
	}

	function define(name, assertion) {
		Assertion.prototype[name] = function assert(value) {
			var self = this
			assertion(self, value)
			return function(message) {
				results[self.i].message = message + "\n\n" + results[self.i].message
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
			succeed(self.i, String(check(self.value)), null)
		} catch (e) {
			if (e instanceof Error) fail(self.i, e.message, e)
			else fail(self.i, String(e), null)
		}
	})
	define("notSatisfies", function notSatisfies(self, check) {
		try {
			fail(self.i, String(check(self.value)), null)
		} catch (e) {
			if (e instanceof Error) succeed(self.i, e.message, e)
			else succeed(self.i, String(e), null)
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

	function succeed(i, message, error) {
		var result = results[i]
		result.pass = true
		result.message = message
		// for notSatisfies. Use the testError for other passing assertions
		if (error != null) result.error = error
	}

	function fail(i, message, error) {
		var result = results[i]
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

	// Reporter
	var colorCodes = {
		red: "31m",
		red2: "31;1m",
		green: "32;1m"
	}

	// console style for terminals
	// see https://stackoverflow.com/questions/4842424/list-of-ansi-color-escape-sequences
	function highlight(message, color) {
		var code = colorCodes[color] || colorCodes.red;
		return hasProcess ? (process.stdout.isTTY ? "\x1b[" + code + message + "\x1b[0m" : message) : "%c" + message + "%c "
	}

	// console style for the Browsers
	// see https://developer.mozilla.org/en-US/docs/Web/API/console#Styling_console_output
	function cStyle(color, bold) {
		return hasProcess||!color ? "" : "color:"+color+(bold ? ";font-weight:bold" : "")
	}

	o.report = function (results) {
		var errCount = -results.bailCount
		for (var i = 0, r; r = results[i]; i++) {
			if (!r.pass) {
				var stackTrace = o.cleanStackTrace(r.error)
				var couldHaveABetterStackTrace = !stackTrace || timeoutStackName != null && stackTrace.indexOf(timeoutStackName) !== -1
				if (couldHaveABetterStackTrace) stackTrace = r.testError != null ? o.cleanStackTrace(r.testError) : r.error.stack || ""
				console.error(
					(hasProcess ? "\n" : "") +
					highlight(r.context + ":", "red2") + "\n" +
					highlight(r.message, "red") +
					(stackTrace ? "\n" + stackTrace + "\n" : ""),

					cStyle("black", true), cStyle(null), // reset to default
					cStyle("red"), cStyle("black")
				)
				errCount++
			}
		}
		var pl = results.length === 1 ? "" : "s"

		var oldTotal = " (old style total: " + (results.length + results.asyncSuccesses) + ")"
		var total = results.length - results.bailCount
		var message = [], log = []

		if (hasProcess) message.push("––––––\n")

		if (name) message.push(name + ": ")

		if (errCount === 0 && results.bailCount === 0) {
			message.push(highlight((pl ? "All " : "The ") + total + " assertion" + pl + " passed" + oldTotal + ". ", "green"))
			log.push(cStyle("green" , true), cStyle(null))
		} else if (errCount === 0) {
			message.push((pl ? "All " : "The ") + total + " assertion" + pl + " passed" + oldTotal + ". ")
		} else {
			message.push(highlight(errCount + " out of " + total + " assertion" + pl + " failed" + oldTotal + ". ", "red2"))
			log.push(cStyle("red" , true), cStyle(null))
		}

		if (results.bailCount !== 0) {
			message.push(highlight("Bailed out " + results.bailCount + (results.bailCount === 1 ? " time" : " times")+ ". ", "red"))
			log.push(cStyle("red"), cStyle(null))
		}

		log.unshift(message.join(""))
		console.log.apply(console.log, log)

		return errCount + results.bailCount
	}
	return o
})

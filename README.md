# ospec

[![npm License](https://img.shields.io/npm/l/ospec.svg)](https://www.npmjs.com/package/ospec) [![npm Version](https://img.shields.io/npm/v/ospec.svg)](https://www.npmjs.com/package/ospec) [![Build Status](https://img.shields.io/travis/MithrilJS/ospec/master.svg)](https://travis-ci.org/MithrilJS/ospec) [![npm Downloads](https://img.shields.io/npm/dm/ospec.svg)](https://www.npmjs.com/package/ospec)

[![Donate at OpenCollective](https://img.shields.io/opencollective/all/mithriljs.svg?colorB=brightgreen)](https://opencollective.com/mithriljs) [![Gitter](https://img.shields.io/gitter/room/mithriljs/mithril.js.svg)](https://gitter.im/mithriljs/mithril.js)

---

[About](#about) | [Usage](#usage) | [CLI](#command-line-interface) | [API](#api) | [Goals](#goals)

Noiseless testing framework

## About

- ~660 LOC including the CLI runner
- terser and faster test code than with mocha, jasmine or tape
- test code reads like bullet points
- assertion code follows [SVO](https://en.wikipedia.org/wiki/Subject–verb–object) structure in present tense for terseness and readability
- supports:
  - test grouping
  - assertions
  - spies
  - `equals`, `notEquals`, `deepEquals` and `notDeepEquals` assertion types
  - `before`/`after`/`beforeEach`/`afterEach` hooks
  - test exclusivity (i.e. `.only`)
  - async tests and hooks
- explicitly regulates test-space configuration to encourage focus on testing, and to provide uniform test suites across projects

## Usage

### Single tests

Both tests and assertions are declared via the `o` function. Tests should have a description and a body function. A test may have one or more assertions. Assertions should appear inside a test's body function and compare two values.

```javascript
var o = require("ospec")

o("addition", function() {
    o(1 + 1).equals(2)
})
o("subtraction", function() {
    o(1 - 1).notEquals(2)
})
```

Assertions may have descriptions:

```javascript
o("addition", function() {
    o(1 + 1).equals(2)("addition should work")

    /* in ES6, the following syntax is also possible
    o(1 + 1).equals(2) `addition should work`
    */
})
/* for a failing test, an assertion with a description outputs this:

addition should work

1 should equal 2

Error
  at stacktrace/goes/here.js:1:1
*/
```

### Grouping tests

Tests may be organized into logical groups using `o.spec`

```javascript
o.spec("math", function() {
    o("addition", function() {
        o(1 + 1).equals(2)
    })
    o("subtraction", function() {
        o(1 - 1).notEquals(2)
    })
})
```

Group names appear as a breadcrumb trail in test descriptions: `math > addition: 2 should equal 2`

### Nested test groups

Groups can be nested to further organize test groups. Note that tests cannot be nested inside other tests.

```javascript
o.spec("math", function() {
    o.spec("arithmetics", function() {
        o("addition", function() {
            o(1 + 1).equals(2)
        })
        o("subtraction", function() {
            o(1 - 1).notEquals(2)
        })
    })
})
```

### Callback test

The `o.spy()` method can be used to create a stub function that keeps track of its call count and received parameters

```javascript
//code to be tested
function call(cb, arg) {cb(arg)}

//test suite
var o = require("ospec")

o.spec("call()", function() {
    o("works", function() {
        var spy = o.spy()
        call(spy, 1)

        o(spy.callCount).equals(1)
        o(spy.args[0]).equals(1)
        o(spy.calls[0]).deepEquals([1])
    })
})
```

A spy can also wrap other functions, like a decorator:

```javascript
//code to be tested
var count = 0
function inc() {
    count++
}

//test suite
var o = require("ospec")

o.spec("call()", function() {
    o("works", function() {
        var spy = o.spy(inc)
        spy()

        o(count).equals(1)
    })
})

```

### Asynchronous tests

If a test body function declares a named argument, the test is assumed to be asynchronous, and the argument is a function that must be called exactly one time to signal that the test has completed. As a matter of convention, this argument is typically named `done`.

```javascript
o("setTimeout calls callback", function(done) {
    setTimeout(done, 10)
})
```

Alternativly you can return a promise or even use an async function in tests:

```javascript
o("promise test", function() {
    return new Promise(function(resolve) {
        setTimeout(resolve, 10)
    })
})
```

```javascript
o("promise test", async function() {
    await someOtherAsyncFunction()
})
```

#### Timeout delays

By default, asynchronous tests time out after 200ms. You can change that default for the current test suite and
its children by using the `o.specTimeout(delay)` function.

```javascript
o.spec("a spec that must timeout quickly", function() {
    // wait 20ms before bailing out of the tests of this suite and
    // its descendants
    o.specTimeout(20)
    o("some test", function(done) {
        setTimeout(done, 10) // this will pass
    })

    o.spec("a child suite where the delay also applies", function () {
        o("some test", function(done) {
            setTimeout(done, 30) // this will time out.
        })
    })
})
o.spec("a spec that uses the default delay", function() {
    // ...
})
```

This can also be changed on a per-test basis using the `o.timeout(delay)` function from within a test:

```javascript
o("setTimeout calls callback", function(done) {
    o.timeout(500) //wait 500ms before bailing out of the test

    setTimeout(done, 300)
})
```

Note that the `o.timeout` function call must be the first statement in its test. It also works with Promise-returning tests:

```javascript
o("promise test", function() {
    o.timeout(1000)
    return someOtherAsyncFunctionThatTakes900ms()
})
```

```javascript
o("promise test", async function() {
    o.timeout(1000)
    await someOtherAsyncFunctionThatTakes900ms()
})
```

Asynchronous tests generate an assertion that succeeds upon calling `done` or fails on timeout with the error message `async test timed out`.

### `before`, `after`, `beforeEach`, `afterEach` hooks

These hooks can be declared when it's necessary to setup and clean up state for a test or group of tests. The `before` and `after` hooks run once each per test group, whereas the `beforeEach` and `afterEach` hooks run for every test.

```javascript
o.spec("math", function() {
    var acc
    o.beforeEach(function() {
        acc = 0
    })

    o("addition", function() {
        acc += 1

        o(acc).equals(1)
    })
    o("subtraction", function() {
        acc -= 1

        o(acc).equals(-1)
    })
})
```

It's strongly recommended to ensure that `beforeEach` hooks always overwrite all shared variables, and avoid `if/else` logic, memoization, undo routines inside `beforeEach` hooks.

### Asynchronous hooks

Like tests, hooks can also be asynchronous. Tests that are affected by asynchronous hooks will wait for the hooks to complete before running.

```javascript
o.spec("math", function() {
    var acc
    o.beforeEach(function(done) {
        setTimeout(function() {
            acc = 0
            done()
        })
    })

    //tests only run after async hooks complete
    o("addition", function() {
        acc += 1

        o(acc).equals(1)
    })
    o("subtraction", function() {
        acc -= 1

        o(acc).equals(-1)
    })
})
```

### Running only some tests

One or more tests can be temporarily made to run exclusively by calling `o.only()` instead of `o`. This is useful when troubleshooting regressions, to zero-in on a failing test, and to avoid saturating console log w/ irrelevant debug information.

```javascript
o.spec("math", function() {
    // will not run
    o("addition", function() {
        o(1 + 1).equals(2)
    })

    // this test will be run, regardless of how many groups there are
    o.only("subtraction", function() {
        o(1 - 1).notEquals(2)
    })

    // will not run
    o("multiplication", function() {
        o(2 * 2).equals(4)
    })

    // this test will be run, regardless of how many groups there are
    o.only("division", function() {
        o(6 / 2).notEquals(2)
    })
})
```

### Running the test suite

```javascript
//define a test
o("addition", function() {
    o(1 + 1).equals(2)
})

//run the suite
o.run()
```

### Running test suites concurrently

The `o.new()` method can be used to create new instances of ospec, which can be run in parallel. Note that each instance will report independently, and there's no aggregation of results.

```javascript
var _o = o.new('optional name')
_o("a test", function() {
    _o(1).equals(1)
})
_o.run()
```

## Command Line Interface

Create a script in your package.json:

```javascript
    "scripts": {
        "test": "ospec",
        ...
    }
```

...and run it from the command line:

```shell
npm test
```

**NOTE:** `o.run()` is automatically called by the cli - no need to call it in your test code.

### CLI Options

Running ospec without arguments is equivalent to running `ospec '**/tests/**/*.js'`. In english, this tells ospec to evaluate all `*.js` files in any sub-folder named `tests/` (the `node_modules` folder is always excluded).

If you wish to change this behavior, just provide one or more glob match patterns:

```shell
ospec '**/spec/**/*.js' '**/*.spec.js'
```

You can also provide ignore patterns (note: always add `--ignore` AFTER match patterns):

```shell
ospec --ignore 'folder1/**' 'folder2/**'
```

Finally, you may choose to load files or modules before any tests run (**note:** always add `--preload` AFTER match patterns):

```shell
ospec --preload esm
```

Here's an example of mixing them all together:

```shell
ospec '**/*.test.js' --ignore 'folder1/**' --preload esm ./my-file.js
```

### native mjs and module support

For Node.js versions >= 13.2, `ospec` supports both ES6 modules and CommonJS packages out of the box. `--preload esm` is thus not needed in that case.

### Run ospec directly from the command line

ospec comes with an executable named `ospec`. npm auto-installs local binaries to `./node_modules/.bin/`. You can run ospec by running `./node_modules/.bin/ospec` from your project root, but there are more convenient methods to do so that we will soon describe.

ospec doesn't work when installed globally (`npm install -g`). Using global scripts is generally a bad idea since you can end up with different, incompatible versions of the same package installed locally and globally.

Here are different ways of running ospec from the command line. This knowledge applies to not just ospec, but any locally installed npm binary.

#### npx

If you're using a recent version of npm (v5+), you can use run `npx ospec` from your project folder.

#### npm-run

If you're using a recent version of npm (v5+), you can use run `npx ospec` from your project folder.

Otherwise, to work around this limitation, you can use [`npm-run`](https://www.npmjs.com/package/npm-run) which enables one to run the binaries of locally installed packages.

```shell
npm install npm-run -g
```

Then, from a project that has ospec installed as a (dev) dependency:

```shell
npm-run ospec
```

#### PATH

If you understand how your system's PATH works (e.g. for [OSX](https://coolestguidesontheplanet.com/add-shell-path-osx/)), then you can add the following to your PATH...

```shell
export PATH=./node_modules/.bin:$PATH
```

...and you'll be able to run `ospec` without npx, npm, etc. This one-time setup will also work with other binaries across all your node projects, as long as you run binaries from the root of your projects.

---

## API

Square brackets denote optional arguments

### void o.spec(String title, Function tests)

Defines a group of tests. Groups are optional

---

### void o(String title, Function([Function done]) assertions)

Defines a test.

If an argument is defined for the `assertions` function, the test is deemed to be asynchronous, and the argument is required to be called exactly one time.

---

### Assertion o(any value)

Starts an assertion. There are six types of assertion: `equals`, `notEquals`, `deepEquals`, `notDeepEquals`, `throws`, `notThrows`.

Assertions have this form:

```shell
o(actualValue).equals(expectedValue)
```

As a matter of convention, the actual value should be the first argument and the expected value should be the second argument in an assertion.

Assertions can also accept an optional description curried parameter:

```javascript
o(actualValue).equals(expectedValue)("this is a description for this assertion")
```

Assertion descriptions can be simplified using ES6 tagged template string syntax:

```javascript
o(actualValue).equals(expectedValue) `this is a description for this assertion`
```

#### Function(String description) o(any value).equals(any value)

Asserts that two values are strictly equal (`===`)

#### Function(String description) o(any value).notEquals(any value)

Asserts that two values are strictly not equal (`!==`)

#### Function(String description) o(any value).deepEquals(any value)

Asserts that two values are recursively equal

#### Function(String description) o(any value).notDeepEquals(any value)

Asserts that two values are not recursively equal

#### Function(String description) o(Function fn).throws(Object constructor)

Asserts that a function throws an instance of the provided constructo

#### Function(String description) o(Function fn).throws(String message)

Asserts that a function throws an Error with the provided message

#### Function(String description) o(Function fn).notThrows(Object constructor)

Asserts that a function does not throw an instance of the provided constructor

#### Function(String description) o(Function fn).notThrows(String message)

Asserts that a function does not throw an Error with the provided message

---

### void o.before(Function([Function done]) setup)

Defines code to be run at the beginning of a test group

If an argument is defined for the `setup` function, this hook is deemed to be asynchronous, and the argument is required to be called exactly one time.

---

### void o.after(Function([Function done) teardown)

Defines code to be run at the end of a test group

If an argument is defined for the `teardown` function, this hook is deemed to be asynchronous, and the argument is required to be called exactly one time.

---

### void o.beforeEach(Function([Function done]) setup)

Defines code to be run before each test in a group

If an argument is defined for the `setup` function, this hook is deemed to be asynchronous, and the argument is required to be called exactly one time.

---

### void o.afterEach(Function([Function done]) teardown)

Defines code to be run after each test in a group

If an argument is defined for the `teardown` function, this hook is deemed to be asynchronous, and the argument is required to be called exactly one time.

---

### void o.only(String title, Function([Function done]) assertions)

Declares that only a single test should be run, instead of all of them

---

### Function o.spy([Function fn])

Returns a function that records the number of times it gets called, and its arguments

#### Number o.spy().callCount

The number of times the function has been called

#### Array&lt;any> o.spy().args

The arguments that were passed to the function in the last time it was called

---

### void o.run([Function reporter])

Runs the test suite. By default passing test results are printed using
`console.log` and failing test results are printed using `console.error`.

If you have custom continuous integration needs then you can use a
reporter to process [test result data](#result-data) yourself.

If running in Node.js, ospec will call `process.exit` after reporting
results by default. If you specify a reporter, ospec will not do this
and allow your reporter to respond to results in its own way.

---

### Number o.report(results)

The default reporter used by `o.run()` when none are provided. Returns the number of failures, doesn't exit Node.js by itself. It expects an array of [test result data](#result-data) as argument.

---

### Function o.new()

Returns a new instance of ospec. Useful if you want to run more than one test suite concurrently

```javascript
var $o = o.new()
$o("a test", function() {
    $o(1).equals(1)
})
$o.run()
```

### throwing Errors

When an error is thrown some tests may be skipped. See the "run time model" for a detailed description of the bailout mechanism.

---

## Result data

Test results are available by reference for integration purposes. You
can use custom reporters in `o.run()` to process these results.

```javascript
o.run(function(results) {
    // results is an array

    results.forEach(function(result) {
        // ...
    })
})
```

---

### Boolean|Null result.pass

- `true` if the assertion passed.
- `false` if the assertion failed.
- `null` if the assertion was incomplete (`o("partial assertion) // and that's it`).

---

### Error result.error

The `Error` object explaining the reason behind a failure. If the assertion failed, the stack will point to the actuall error. If the assertion did pass or was incomplete, this field is identical to `result.testError`.

---

### Error result.testError

An `Error` object whose stack points to the test definition that wraps the assertion. Useful as a fallback because in some async cases the main may not point to test code.

---

### String result.message

If an exception was thrown inside the corresponding test, this will equal that Error's `message`. Otherwise, this will be a preformatted message in [SVO form](https://en.wikipedia.org/wiki/Subject%E2%80%93verb%E2%80%93object). More specifically, `${subject}\n${verb}\n${object}`.

As an example, the following test's result message will be `"false\nshould equal\ntrue"`.

```javascript
o.spec("message", function() {
    o(false).equals(true)
})
```

If you specify an assertion description, that description will appear two lines above the subject.

```javascript
o.spec("message", function() {
    o(false).equals(true)("Candyland") // result.message === "Candyland\n\nfalse\nshould equal\ntrue"
})
```

---

### String result.context

A `>`-separated string showing the structure of the test specification.
In the below example, `result.context` would be `testing > rocks`.

```javascript
o.spec("testing", function() {
    o.spec("rocks", function() {
        o(false).equals(true)
    })
})
```

---

## Run time model

### Definitions

- A **test** is the function passed to `o("description", function test() {})`.
- A **hook** is a function passed to `o.before()`, `o.after()`. `o.beforeEach()` and `o.afterEach()`.
- A **task** designates either a test or a hook.
- A given test and its associated `beforeEach` and `afterEach` hooks form a **streak**. The `beforeEach` hooks run outermost first, the `afterEach` run outermost last. The hooks are optional, and are tied at test-definition time in the `o.spec()` calls that enclose the test.
- A **spec** is a collection of streaks, specs, one `before` hook and one `after` hook. Each component is optional. Specs are defined with the `o.spec("spec name", function specDef() {})` calls.

### The phases of an ospec run

For a given instance, an `ospec` run goes through three phases:

1) tests definition
1) tests execution and results accumulation
1) results presentation

#### Tests definition

This phase is synchronous. `o.spec("spec name", function specDef() {})`, `o("test name", function test() {})` and hooks calls generate a tree of specs and tests.

#### Test execution and results accumulation

At test execution time, for each spec, the `before` hook is called if present, then nested specs the streak of each test, in definition order, then the `after` hook, if present.

Test and hooks may contain assertions, which will populate the `results` array.

#### Results presentation

Once all tests have run or timed out, the results are presented.

### Throwing errors and spec bail out

While some testing libraries consider error thrown as assertions failure, `ospec` treats them as super-failures. Throwing will cause the current spec to be aborted, avoiding what can otherwise end up as pages of errors. What this means depends on when the error is thrown. Specifically:

- A syntax error in a file causes the file to be ignored by the runner.
- At test-definition time:
  - An error thrown at the root of a file will cause subsequent tests and specs to be ignored.
  - An error thrown in a spec definition will cause the spec to be ignored.
- At test-execution time:
  - An error thrown in the `before` hook will cause the streaks and nested specs to be ignored. The `after` hook will run.
  - An error thrown in a task...
    - ...prevents further streaks and nested specs in the current spec from running. The `after` *hook* of the spec will run.
    - ...if thrown in a `beforeEach` hook of a streak, causes the streak to be hollowed out. Hooks defined in nested scopes and the actual test will not run. However, the `afterEach` hook corresponding to the one that crashed will run, as will those defined in outer scopes.
  
For every error thrown, a "bail out" failure is reported.

---

## Goals

- Do the most common things that the mocha/chai/sinon triad does without having to install 3 different libraries and several dozen dependencies
- Disallow configuration in test-space:
  - Disallow ability to pick between API styles (BDD/TDD/Qunit, assert/should/expect, etc)
  - Disallow ability to add custom assertion types
  - Provide a default simple reporter
- Make assertion code terse, readable and self-descriptive
- Have as few assertion types as possible for a workable usage pattern

Explicitly disallowing modularity and configuration in test-space has a few benefits:

- tests always look the same, even across different projects and teams
- single source of documentation for entire testing API
- no need to hunt down plugins to figure out what they do, especially if they replace common javascript idioms with fuzzy spoken language constructs (e.g. what does `.is()` do?)
- no need to pollute project-space with ad-hoc configuration code
- discourages side-tracking and yak-shaving

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

o("addition", o => {
    o(1 + 1).equals(2)
})
o("subtraction", o => {
    o(1 - 1).notEquals(2)
})
```

Assertions may have descriptions:

```javascript
o("addition", o => {
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
o.spec("math", () => {
    o("addition", o => {
        o(1 + 1).equals(2)
    })
    o("subtraction", o => {
        o(1 - 1).notEquals(2)
    })
})
```

Group names appear as a breadcrumb trail in test descriptions: `math > addition: 2 should equal 2`

### Nested test groups

Groups can be nested to further organize test groups. Note that tests cannot be nested inside other tests.

```javascript
o.spec("math", () => {
    o.spec("arithmetics", () => {
        o("addition", o => {
            o(1 + 1).equals(2)
        })
        o("subtraction", o => {
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

o.spec("call()", () => {
    o("works", o => {
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

o.spec("call()", () => {
    o("works", o => {
        var spy = o.spy(inc)
        spy()

        o(count).equals(spy.callCount)
    })
})

```

### Asynchronous tests

```javascript
o("setTimeout calls callback", o => {
    return new Promise(fulfill => setTimeout(fulfill, 10))
})
```

Alternativly you can return a promise or even use an async function in tests:

```javascript
o("promise test", o => {
    return new Promise(resolve => {
        setTimeout(resolve, 10)
    })
})
```

```javascript
o("promise test", async () => {
    await someOtherAsyncFunction()
})
```

#### Timeout delays

By default, asynchronous tests time out after 200ms. You can change that default for the current test suite and
its children by using the `o.specTimeout(delay)` function.

```javascript
o.spec("a spec that must timeout quickly", () => {
    // wait 20ms before bailing out of the tests of this suite and
    // its descendants
    const waitFor = n => new Promise(f => setTimeout(f, n))
    o.specTimeout(20)
    o("some test", async o => {
        await waitFor(10)
        o(1 + 1).equals(2)
    })

    o.spec("a child suite where the delay also applies", () => {
        o("some test", async o => {
            await waitFor(30) // this will cause a timeout to be reported
            o(1 + 1).equals(2)// even if the assertions succeed.
        })
    })
})
o.spec("a spec that uses the default delay", () => {
    // ...
})
```

This can also be changed on a per-test basis using the `o.timeout(delay)` function from within a test:

```javascript
const waitFor = n => new Promise(f => setTimeout(f, n))
o("setTimeout calls callback", async o => {
    o.timeout(500) //wait 500ms before setting the test as timed out and moving forward.
    await(300)
    o(1 + 1).equals(2)
})
```

Note that the `o.timeout` function call must be the first statement in its test.

Test timeouts are reported along with test failures and errors thrown at the end of the run. A test timeout causes the test runner to exit with a non-zero status code.

### `before`, `after`, `beforeEach`, `afterEach` hooks

These hooks can be declared when it's necessary to setup and clean up state for a test or group of tests. The `before` and `after` hooks run once each per test group, whereas the `beforeEach` and `afterEach` hooks run for every test.

```javascript
o.spec("math", () => {
    var acc
    o.beforeEach(() => {
        acc = 0
    })

    o("addition", o => {
        acc += 1

        o(acc).equals(1)
    })
    o("subtraction", o => {
        acc -= 1

        o(acc).equals(-1)
    })
})
```

It's strongly recommended to ensure that `beforeEach` hooks always overwrite all shared variables, and avoid `if/else` logic, memoization, undo routines inside `beforeEach` hooks.

You can run assertions from the hooks:

```javascript
o.afterEach(o => {
    o(postConditions).equals(met)
})
```

### Asynchronous hooks

Like tests, hooks can also be asynchronous. Tests that are affected by asynchronous hooks will wait for the hooks to complete before running.

```javascript
o.spec("math", () => {
    let state
    o.beforeEach(async() => {
        // async initialization
        state = await (async function () {return 0})()
    })

    //tests only run after the async hooks are complete
    o("addition", o => {
        state += 1

        o(state).equals(1)
    })
    o("subtraction", o => {
        acc -= 1

        o(state).equals(-1)
    })
})
```

To ease the transition from older `ospec` versions to the v5+ API, we also provide a `done` helper, to be used as follow:

```javascript
o("setTimeout calls callback", ({o, done}) => {
    setTimeout(()=>{
        if (error) done(error)
        else done()
    }), 10)
})
```

If an argument is passed to `done`, the corresponding promise is rejected.

### Running only some tests

One or more tests can be temporarily made to run exclusively by calling `o.only()` instead of `o`. This is useful when troubleshooting regressions, to zero-in on a failing test, and to avoid saturating console log w/ irrelevant debug information.

```javascript
o.spec("math", () => {
    // will not run
    o("addition", o => {
        o(1 + 1).equals(2)
    })

    // this test will be run, regardless of how many groups there are
    o.only("subtraction", () => {
        o(1 - 1).notEquals(2)
    })

    // will not run
    o("multiplication", o => {
        o(2 * 2).equals(4)
    })

    // this test will be run, regardless of how many groups there are
    o.only("division", () => {
        o(6 / 2).notEquals(2)
    })
})
```

### Running the test suite

```javascript
//define a test
o("addition", o => {
    o(1 + 1).equals(2)
})

//run the suite
o.run()
```

### Running test suites concurrently

The `o.new()` method can be used to create new instances of ospec, which can be run in parallel. Note that each instance will report independently, and there's no aggregation of results.

```javascript
var _o = o.new('optional name')
_o("a test", o => {
    o(1).equals(1)
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

**NOTE:** `o.run()` is automatically called by the CLI runner - no need to call it in your test code.

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

### `o.spec(title: string, tests: () => void) => void`

Defines a group of tests. Groups are optional

---

### `o(title: string,  assertions: (o: AssertionFactory) => void) => void`

Defines a test. The `assertions` function can be async. It receives the assertion factory as argument.

---

### `type AssertionFactory = (value: any) => Assertion`

Starts an assertion. There are seven types of assertion: `equals`, `notEquals`, `deepEquals`, `notDeepEquals`, `throws`, `notThrows`, and, for extensions, `_`.

```typescript
type OptionalMessage = (message:string) => void

type AssertionResult = {pass: boolean, message: string}

interface Assertion {
  equals: (value: any) => OptionalMessage
  notEquals: (value: any) => OptionalMessage
  deepEquals: (value: any) => OptionalMessage
  notDeepEquals: (value: any) => OptionalMessage
  throws: (value: any) => OptionalMessage
  notThrows: (value: any) => OptionalMessage
  // For plugins:
  _: (validator: ()=>AssertionResult) => void
}

```

Assertions have this form:

```javascript
o(actualValue).equals(expectedValue)
```

As a matter of convention, the actual value should be the first argument and the expected value should be the second argument in an assertion.

Assertions can also accept an optional description curried parameter:

```javascript
o(actualValue).equals(expectedValue)("this is a description for this assertion")
```

Assertion descriptions can be simplified using ES6 tagged template string syntax:

```javascript
o(actualValue).equals(expectedValue)`likewise, with an interpolated ${value}`
```

#### `o(value: any).equals(value: any)`

Asserts that two values are strictly equal (`===`). Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(value: any).notEquals(value: any)`

Asserts that two values are strictly not equal (`!==`). Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(value: any).deepEquals(value: any)`

Asserts that two values are recursively equal. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(value: any).notDeepEquals(value: any)`

Asserts that two values are not recursively equal. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(fn: (...args: any[]) => any).throws(fn: constructor)`

Asserts that a function throws an instance of the provided constructor. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(fn: (...args: any[]) => any).throws(message: string)`

Asserts that a function throws an Error with the provided message. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(fn: (...args: any[]) => any).notThrows(fn: constructor)`

Asserts that a function does not throw an instance of the provided constructor. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

#### `o(fn: (...args: any[]) => any).notThrows(message: string)`

Asserts that a function does not throw an Error with the provided message. Returns an `OptionalMessage` that can be called if desired to contextualize the assertion message.

---

### `o.before(setup: (o: AssertionFactoy) => void)`

Defines code to be run at the beginning of a test group.

The `AssertionFactory` is injected as an argument into the `setup` function. It is called `o` by convention.

---

### `o.after(teardown: (o: AssertionFactoy) => void)`

Defines code to be run at the end of a test group.

The `AssertionFactory` is injected as an argument into the `setup` function. It is called `o` by convention.

---

### `o.beforeEach(setup: (o: AssertionFactoy) => void)`

Defines code to be run before each test in a group.

The `AssertionFactory` is injected as an argument into the `setup` function. It is called `o` by convention.

---

### `o.after(teardown: (o: AssertionFactoy) => void)`

Defines code to be run after each test in a group.

The `AssertionFactory` is injected as an argument into the `setup` function. It is called `o` by convention.

---

### `o.only(title: string, assertions: (o: AssertionFactoy) => void)`

You can replace a `o("message", o=>{/* assertions */})` call with `o.only("message", o=>{/* assertions */})`. If `o.only` is encountered plain `o()` test definitions will be ignored, and those maked as `only` will be the only ones to run.

---

### `o.spy(fn: (...args: any[]) => any)`

Returns a function that records the number of times it gets called, and its arguments.

The resulting function has the same `.name` and `.length` properties as the one `o.spy()` received as argument. It also has the following additional properties:

#### `o.spy().callCount`

The number of times the function has been called

#### `o.spy().args`

The `arguments` that were passed to the function in the last time it was called

#### `o.spy().calls`

An array of `{this, args}` objects that reflect, for each time the spied on function was called, the `this` value recieved if it was called as a method, and the corresponding `args`.

---

### `o.run(reporter: (results: Result[]) => number)`

Runs the test suite. By default passing test results are printed using
`console.log` and failing test results are printed using `console.error`.

If you have custom continuous integration needs then you can use a
reporter to process [test result data](#result-data) yourself.

If running in Node.js, ospec will call `process.exit` after reporting
results by default. If you specify a reporter, ospec will not do this
and allows your reporter to respond to results in its own way.

---

### `o.report(results: Result[])`

The default reporter used by `o.run()` when none are provided. Returns the number of failures. It expects an array of [test result data](#result-data) as argument.

---

### `o.new()`

Returns a new instance of ospec. Useful if you want to run more than one test suite concurrently

```javascript
var $o = o.new()
$o("a test", o => {
    o(1).equals(1)
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
interface Result {
    pass: Boolean | null,
    message: string,
    context: string,
    error: Error,
    testError: Error,
}

o.run((results: Results[]) => {
    // results is an array

    results.forEach(result => {
        // ...
    })
})
```

---

### `result.pass`

- `true` if the assertion passed.
- `false` if the assertion failed.
- `null` if the assertion was incomplete (`o("partial assertion")` without an assertion method called).

---

### `result.error`

The `Error` object explaining the reason behind a failure. If the assertion failed, the stack will point to the actuall error. If the assertion did pass or was incomplete, this field is identical to `result.testError`.

---

### `result.testError`

An `Error` object whose stack points to the test definition that wraps the assertion. Useful as a fallback because in some async cases the main may not point to test code.

---

### `result.message`

If an exception was thrown inside the corresponding test, this will equal that Error's `message`. Otherwise, this will be a preformatted message in [SVO form](https://en.wikipedia.org/wiki/Subject%E2%80%93verb%E2%80%93object). More specifically, `${subject}\n${verb}\n${object}`.

As an example, the following test's result message will be `"false\nshould equal\ntrue"`.

```javascript
o.spec("message", () => {
    o(false).equals(true)
})
```

If you specify an assertion description, that description will appear two lines above the subject.

```javascript
o.spec("message", () => {
    o(false).equals(true)("Candyland") // result.message === "Candyland\n\nfalse\nshould equal\ntrue"
})
```

---

### `result.context`

A `>`-separated string showing the structure of the test specification.
In the below example, `result.context` would be `testing > rocks`.

```javascript
o.spec("testing", () => {
    o.spec("rocks", () => {
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

Ospec started as a bare bones test runner optimized for Leo Horie to write Mithril v1 with as little hasle as possible. It has since grown in capabilities and polish, and while we tried to keep some of the original spirit, the current incarnation is not as radically minimalist as the original. The state of the art in testing has also moved with the dominance of Jest over Jasmine and Mocha, and now Vitest coming up the horizon. The goals in 2023 are:

- Do the most common things that the mocha/chai/sinon triad does without having to install 3 different libraries and several dozen dependencies
- Limit configuration in test-space:
  - Disallow ability to pick between API styles (BDD/TDD/Qunit, assert/should/expect, etc)
  - No "magic" plugin system with global reach.
  - Provide a default simple reporter
- Make assertion code terse, readable and self-descriptive
- Have as few assertion types as possible for a workable usage pattern
- Don't flood the result log with failures if you break a core part of the project you're testing. An error thrown in test space will abort the current spec.

These restrictions have a few benefits:

- tests always look the same, even across different projects and teams
- single source of documentation for entire testing API
- no need to hunt down plugins to figure out what they do, especially if they replace common javascript idioms with fuzzy spoken language constructs (e.g. what does `.is()` do?)
- no need to pollute project-space with ad-hoc configuration code
- discourages side-tracking and yak-shaving

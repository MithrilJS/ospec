"use strict"

const {sequence, either, suffix, capture, avoid} = require("compose-regexp")
const oneOrMore = suffix("+")
const zeroOrMore = suffix("*")
const maybe = suffix("?")

const any = /[^]/
const space = /\s/

const multiLineComment = sequence("/*", suffix("*?", any), "*/")

// |$ not needed at the end since this is the
// start of a function that has one parameter
// and we don't scan past said parameter
// there is necessrily more text following
// a comment that occurs in this scenario
const singleLineComment = sequence("//", zeroOrMore(/[^\n]/), "\n")

const ignorable = suffix("*", either(space, multiLineComment, singleLineComment))

// very loose definitions here, knowing that we're matching valid JS
// space, '(' for the start of the args, '/' for a comment
const funcName = /[^\s(\/]+/
// space, '[' and '{' for destructuring, ')' for the end of args, ',' for next argument,
// '=' for => and '/' for comments
const argName = /[^\s{[),=\/]+/

const prologue = (____) => maybe(
	maybe("function", ____, maybe(/\b/, funcName, ____)),
	"(",
	____
)

// This captures the first identifier after skipping
// (?:(?:function identifier?)? \()?
const doneMatcher = sequence(/^/, prologue(ignorable), capture(argName))

console.log("without comments: ", sequence(/^/, prologue(/ */), capture(argName)))

// ------------------------------------------------------------ //
// tests and output if all green

const o = require('ospec')

const test = (input) => (doneMatcher.exec(input)||[]).pop()

o("done parser", () => {
	let match;

	o(
		test("function(done)")
	).equals("done")

	o(
		test("function (done)")
	).equals("done")

	o(
		test("function foo(done)")
	).equals("done")

	o(
		test("function foo (done)")
	).equals("done")

	o(
		test(`function /**/ /* foo */ //hoho
			/*
			bar */
			//baz
			(done)`)
	).equals("done")

	o(
		test(`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo(done)`)
	).equals("done")

	o(
		test(`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			(done)`)
	).equals("done")

	o(
		test("function(done, timeout)")
	).equals("done")

	o(
		test("function (done, timeout)")
	).equals("done")

	o(
		test("function foo(done, timeout)")
	).equals("done")

	o(
		test("function foo (done, timeout)")
	).equals("done")

	o(
		test("function( done, timeout)")
	).equals("done")

	o(
		test("function ( done, timeout)")
	).equals("done")

	o(
		test("function foo( done, timeout)")
	).equals("done")

	o(
		test("function foo ( done, timeout)")
	).equals("done")

	o(
		test(`function /**/ /* foo */ //hoho
			/*
			bar */
			//baz
			( done, timeout)`)
	).equals("done")

	o(
		test(`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo(done, timeout)`)
	).equals("done")

	o(
		test(`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			(/**/ /* foo */ //hoho
				/*
				bar */
				//baz
			done, timeout)`)
	).equals("done")

	o(
		test(`( done ) => `)
	).equals("done")

	o(
		test(`( done/**/, define) => `)
	).equals("done")

	o(
		test(`( done, define) => `)
	).equals("done")

	o(
		test(`( done , define) => `)
	).equals("done")

	o(
		test(`(//foo
				/*
				*/done//more comment
				/* and then some
				*/) => `
			)
	).equals("done")

	o(
		test("done =>")
	).equals("done")

	o(
		test("done=>")
	).equals("done")

	o(
		test("done /* foo */=>")
	).equals("done")

	o(
		test("done/* foo */ =>")
	).equals("done")

	o(
		test("done /* foo */ /*bar*/ =>")
	).equals("done")

	o(
		test('function$dada =>')
	).equals('function$dada')

	o(
		test('(function$dada) =>')
	).equals('function$dada')
	o(
		test('function(function$dada) {')
	).equals('function$dada')
})

o.run((results) => {
	if (o.report(results) === 0) console.log(`Paste this:\n\n${doneMatcher}\n`)
})

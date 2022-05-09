"use strict"

import { sequence, either, suffix, capture } from "compose-regexp"
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

const tests = [
	["function(done)", "done"],
	["function (done)", "done"],
	["function foo(done)", "done"],
	["function foo (done)", "done"],
	[`function /**/ /* foo */ //hoho
			/*
			bar */
			//baz
			(done)`, "done"],
	[`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo(done)`, "done"],
	[`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			(done)`, "done"],
	["function(done, timeout)", "done"],
	["function (done, timeout)", "done"],
	["function foo(done, timeout)", "done"],
	["function foo (done, timeout)", "done"],
	["function( done, timeout)", "done"],
	["function ( done, timeout)", "done"],
	["function foo( done, timeout)", "done"],
	["function foo ( done, timeout)", "done"],
	[`function /**/ /* foo */ //hoho
			/*
			bar */
			//baz
			( done, timeout)`, "done"],
	[`function/**/ /* foo */ //hoho
			/*
			bar */
			//baz
			foo(done, timeout)`, "done"],
	[`function/**/ /* foo */ //hoho
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
			done, timeout)`, "done"],
	["( done ) => ", "done"],
	["( done/**/, define) => ", "done"],
	["( done, define) => ", "done"],
	["( done , define) => ", "done"],
	[`(//foo
				/*
				*/done//more comment
				/* and then some
				*/) => `, "done"],
	["done =>", "done"],
	["done=>", "done"],
	["done /* foo */=>", "done"],
	["done/* foo */ =>", "done"],
	["done /* foo */ /*bar*/ =>", "done"],
	["function$dada =>", "function$dada"],
	["(function$dada) =>", "function$dada"],
	["function(function$dada) {", "function$dada"],
]


let ok = true;

tests.forEach(([candidate, expected]) => {
	if ((doneMatcher.exec(candidate)||[]).pop() !== expected) {
		ok = false
		console.log(
			`parsing \n\n\t${
				candidate
			}\n\nresulted in ${
				JSON.stringify(((doneMatcher.exec(candidate)||[]).pop()))
			}, not ${
				JSON.stringify(expected)
			} as expected\n`
		)
	}
})

if (ok) console.log(`Paste this:\n\n${doneMatcher}\n`)

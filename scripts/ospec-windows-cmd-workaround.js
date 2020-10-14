// Why does this exist? Because Microsoft and all their wisdom decided it was a
// good idea to always search the current working directory before the system
// path. And yes, it takes into account %PathExt% while doing so, just like it
// does with the %Path% lookup. And because there's an `ospec.js` in the root,
// when npm runs `cmd` to execute scripts (and when `npx` invokes it, too, for
// some reason), cmd finds that file and tries to execute it.
//
// Of course, if you don't want to break dozens of programs and possibly system
// internals as well, you shouldn't change the default `.js` extension from
// Windows Script Host. npm and npx also don't let you configure environment
// variables when running `package.json` scripts - they just inherit everything.
// And without the ability to change *something* for npm or npx to work, this is
// the next best thing.
//
// Of course, other operating systems don't need this, but everything goes
// through this script anyways just for simplicity.
"use strict"

const path = require("path")
const chp = require("child_process")

chp.spawn(
	path.resolve(__dirname, "../node_modules/.bin/ospec"),
	process.argv.slice(2),
	{stdio: "inherit", shell: true}
)

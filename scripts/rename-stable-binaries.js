// This is a dev script that is shipped with the package because
// I couldn't find a cross-platform way of running code conditionally
// The shell syntaxes are too complex.

const {rename} = require("node:fs/promises")
const glob = require("glob")

glob("node_modules/.bin/ospec*(.*)")

.on("match", x => {rename(x, x.replace(/ospec(?:-stable)?((?:\.\w+)?)/, "ospec-stable$1"))})

.on("error", e => {
    console.error(e)
    process.exit(1)
})

.on("end", () => {process.exit(0)})

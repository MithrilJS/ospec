import {rename as fsRename} from "node:fs/promises"
import glob from "glob"

function rename(x) {
    fsRename(x, x.replace(/ospec(?:-stable)?((?:\.\w+)?)/, "ospec-stable$1"))
}

glob("./node_modules/.bin/ospec*(.*)")
.on("match", rename)
.on("error", (e) => {
    console.error(e)
    process.exit(1)
})
.on("end", () => {process.exit(0)})
/* eslint-disable wrap-regex */
"use strict"

const o = require("ospec")
const fs = require("fs")
const {copyFile, lstat, mkdir, readdir, rmdir, symlink, unlink, writeFile} = fs.promises
const {join} = require("path")
const chp = require("child_process")

const projectCwd = process.cwd()
const ospecPkgJsonPath = join(projectCwd, "package.json")
const ospecLibPath = join(projectCwd, "ospec.js")
const ospecBinPath = join(projectCwd, "bin/ospec")
const fixturesDir = join(projectCwd, "./tests/fixtures")

const parsed = /^v(\d+)\.(\d+)\./.exec(process.version)

const supportsESM = parsed && Number(parsed[1]) > 13 || Number(parsed[1]) === 13 && Number(parsed[2]) >= 2


function stringify(arg) {
	return JSON.stringify(arg, null, 2)
}
const moduleKinds = supportsESM
	? ["cjs", "esm"]
	: (console.log("Skipping ESM tests due to lack of platform support"), ["cjs"])
const commands = ["node", "npm", "yarn"].filter((launcher) => {
	try {
		chp.execFileSync(launcher, ["-v"])
		return true
	} catch(e) {
		return false
	}
})

// not sure how that could happen...
if (commands.length === 0) throw new Error("couldn't find either node, npm nor yarn")

const isWindows = process.platform === "win32"

// The scripts' sources were copied from npm's scripts.
const winScriptDir = join(fixturesDir, "windows-dot-bin")

const finalizeBinaryInstall = isWindows
	? async (path) => {
		await Promise.all(["ospec", "ospec.cmd", "ospec.ps1"].map((name) =>
			copyFile(join(winScriptDir, name), join(path, name))
		))
	}
	: async (path) => {
		await symlink("../ospec/bin/ospec", join(path, "ospec"))
	}

function execFile(command, args, options) {
	if (typeof options.cwd !== "string") throw new Error(`\`options.cwd\`: string expected for ${command} ${stringify(args)} ${stringify(options)}`)
	return new Promise((fulfill, reject) => {
		chp.execFile(command, args, {
			shell: true,
			...options,
			timeout: 5000,
			killSignal: "SIGKILL",
			windowsHide: true
		}, (error, stdout, stderr) => {
			if (error != null && typeof error.code !== "number") {
				reject(error)
			} else {
				fulfill({
					code: error == null ? 0 : error.code,
					stdout,
					stderr
				})
			}
		})
	})
}

function removeWarrnings(stderr) {
	return stderr.split("\n").filter((x) => !x.includes("ExperimentalWarning") && !x.includes("npm WARN lifecycle")).join("\n")
}
function removeYarnExtraOutput(stdout) {
	return stdout.split("\n").filter((line) => !/^Done in [\d\.s]+$/.test(line) && !line.includes("yarnpkg")).join("\n")
}
function checkIfFilesExist(cwd, files) {
	return Promise.all(files.map((list) => {
		const path = join(cwd, ...list.split("/"))
		// FIXME: revert these back to one line after next ospec update
		return lstat(path).then(
			() => {const test = o({found: true}).deepEquals({found: true}); if (test) test(path)}
		).catch(
			(e) => { const test = o(e.stack).equals(false); if (test) test("sanity check failed") }
		)
	}))
}

async function remove(path) {
	try {
		const stats = await lstat(path)
		if (stats.isDirectory()) {
			await Promise.all((await readdir(path)).map((child) => remove(join(path, child))))
			// console.log("removing", {path})
			return rmdir(path)
		} else {
			// console.log("removing", {path})
			return unlink(path)
		}
	// eslint-disable-next-line no-empty
	} catch(e) {
		if (e.code !== "ENOENT") throw e
	}
}

async function createDir(js, prefix, mod) {
	await mkdir(prefix)
	for (const k in js) {
		const path = join(prefix, k)
		const content = js[k][mod]
		if (typeof content === "string") await writeFile(path, content)
		else await createDir(js[k], path, mod)
	}
}
async function createPackageJson(pkg, cwd, mod) {
	if (mod === "esm") pkg = {...pkg, type: "module"}
	await writeFile(join(cwd, "package.json"), JSON.stringify(pkg, null, "\t"))
}
async function createNodeModules(path) {
	const modulePath = join(path, "node_modules")
	const dotBinPath = join(modulePath, ".bin")

	const dummyCjsDir = join(modulePath, "dummy-module-with-tests-cjs")
	const dummyCjsTestDir = join(dummyCjsDir, "tests")

	const ospecLibDir = join(modulePath, "ospec")
	const ospecBinDir = join(ospecLibDir, "bin")

	await mkdir(dummyCjsTestDir, {recursive: true})
	await writeFile(
		join(dummyCjsDir, "package.json"),
		'{"type": "commonjs"}'
	)
	await writeFile(
		join(dummyCjsTestDir, "should-not-run.js"),
		"\"use strict\";console.log(__filename + ' ran')"
	)

	await mkdir(ospecBinDir, {recursive: true})
	await copyFile(ospecPkgJsonPath, join(ospecLibDir, "package.json"))
	await copyFile(ospecLibPath, join(ospecLibDir, "ospec.js"))
	await copyFile(ospecBinPath, join(ospecBinDir, "ospec"))

	await mkdir(dotBinPath)
	await finalizeBinaryInstall(dotBinPath)
}

function expandPaths(o, result, prefix = "") {
	for (const k in o) {
		const path = join(prefix, k)
		if(typeof o[k] === "string") result.push(path)
		else expandPaths(o[k], result, path)
	}
	return result
}

function runningIn({scenario, files}, suite) {
	const scenarioPath = join(fixturesDir, scenario)
	// eslint-disable-next-line global-require
	const config = require(join(scenarioPath, "config.js"))
	const allFiles = expandPaths(config.js, ["node_modules/dummy-module-with-tests-cjs/tests/should-not-run.js"])

	o.spec(scenario, () => {
		moduleKinds.forEach((mod) => {
			o.spec(mod, () => {
				const cwd = join(scenarioPath, mod)

				o.before(async () => {
					o.timeout(10000)
					await remove(cwd)
					await createDir(config.js, cwd, mod)
					await createPackageJson(config["package.json"], cwd, mod)
					await createNodeModules(cwd, mod)
					// sanity checks
					await checkIfFilesExist(cwd, files)
					const snrPath = join(
						cwd, "node_modules", "dummy-module-with-tests-cjs", "tests", "should-not-run.js"
					)
					await execFile("node", [snrPath], {cwd}).then(
						({code, stdout, stderr}) => {
							stdout = stdout.replace(/\r?\n$/, "")
							stderr = removeWarrnings(stderr)
							// FIXME: revert these back to one line after next ospec update
							let test
							test = o({code}).deepEquals({code: 0}); if (test) test(snrPath)
							test = o({stdout}).deepEquals({stdout: `${snrPath} ran`}); if (test) test(snrPath)
							test = o({stderr}).deepEquals({stderr: ""}); if (test) test(snrPath)
						},
					)
				})
				commands.forEach((command) => {
					o.spec(command, () => {
						const args = command === "node"
							? (script) => ["./node_modules/ospec/bin/ospec", config["package.json"].scripts[script].slice(6)]
							: (script) => ["run", script]


						suite({cwd, command, args, allFiles})
					})
				})
			})
		})
	})
}

function check({haystack, needle, label, expected}) {
	// const needle = join(cwd, file) + suffix
	const found = haystack.includes(needle)
	if (!found) {
		fs.writeSync(1, `- ${label}
> ${expected ? "expected" : "not expected"}: ${needle}

${haystack}

----------------------------------------------------------------------

`)
	}
	// FIXME: revert this back to one line after next ospec update
	const test = o({[label]: found}).deepEquals({[label]: expected})
	if (test) test(haystack + "\n\nexpected: " + needle)
}

function checkWhoRanAndHAdTests({shouldRun, shouldTest, shouldThrow, cwd, stdout, stderr, allFiles}) {
	allFiles.forEach((file) => {
		const fullPath = join(cwd, file)
		check({
			haystack: stdout,
			needle: fullPath + " ran",
			label: "ran",
			expected: shouldRun.has(file)
		})
		check({
			haystack: stdout,
			needle: fullPath + " had tests",
			label: "had tests",
			expected: shouldTest.has(file)
		})
		if (shouldThrow != null) {
			check({
				haystack: stderr,
				needle: fullPath,
				label: "threw",
				expected: shouldThrow.has(file)
			})
		}
	})
}

o.spec("cli", function() {
	runningIn({
		scenario: "success",
		files: [
			"explicit/explicit1.js",
			"explicit/explicit2.js",
			"main.js",
			"node_modules/dummy-module-with-tests-cjs/tests/should-not-run.js",
			"node_modules/ospec/bin/ospec",
			"node_modules/ospec/package.json",
			"node_modules/ospec/ospec.js",
			"other.js",
			"package.json",
			"tests/main1.js",
			"tests/main2.js",
			"very/deep/tests/deep1.js",
			"very/deep/tests/deeper/deep2.js"
		]
	}, ({cwd, command, args, allFiles}) => {
		if (command !== "node") o("which", function() {
			o.timeout(10000)
			return execFile(command, ["run", "which"], {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})
				if (test) test(stdout)
			})
		})
		o("default", function() {
			o.timeout(10000)
			return execFile(command, args("default"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 8 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("explicit-one", function() {
			o.timeout(10000)
			return execFile(command, args("explicit-one"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 2 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"explicit/explicit1.js",
				])
				const shouldTest = new Set([
					"explicit/explicit1.js",
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("explicit-several", function() {
			o.timeout(10000)
			return execFile(command, args("explicit-several"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 4 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"explicit/explicit1.js",
					"explicit/explicit2.js"
				])
				const shouldTest = new Set([
					"explicit/explicit1.js",
					"explicit/explicit2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("explicit-glob", function() {
			o.timeout(10000)
			return execFile(command, args("explicit-glob"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 4 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"explicit/explicit1.js",
					"explicit/explicit2.js"
				])
				const shouldTest = new Set([
					"explicit/explicit1.js",
					"explicit/explicit2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("preload-one", function() {
			o.timeout(10000)
			return execFile(command, args("preload-one"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 8 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"main.js",
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("preload-several", function() {
			o.timeout(10000)
			return execFile(command, args("preload-several"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 2 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"main.js",
					"other.js",
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("require-one", function() {
			o.timeout(10000)
			return execFile(command, args("require-one"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: "Warning: The --require option has been deprecated, use --preload instead\n"})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 2 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"main.js",
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("require-several", function() {
			o.timeout(10000)
			return execFile(command, args("require-several"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: "Warning: The --require option has been deprecated, use --preload instead\n"})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 2 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"main.js",
					"other.js",
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("ignore-one", function() {
			o.timeout(10000)
			return execFile(command, args("ignore-one"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 6 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"tests/main1.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("ignore-one-glob", function() {
			o.timeout(10000)
			return execFile(command, args("ignore-one-glob"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 4 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"tests/main1.js",
					"tests/main2.js",
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
		o("ignore-several", function() {
			o.timeout(10000)
			return execFile(command, args("ignore-several"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o(/All 2 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)).equals(true)
				if (test) test(stdout.match(/\n[^\n]+\n$/))

				const shouldRun = new Set([
					"tests/main1.js",
				])
				const shouldTest = new Set([
					"tests/main1.js",
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
			})
		})
	})

	///////////

	///////////

	///////////

	///////////

	runningIn({
		scenario: "throws",
		files: [
			"main.js",
			"node_modules/dummy-module-with-tests-cjs/tests/should-not-run.js",
			"node_modules/ospec/bin/ospec",
			"node_modules/ospec/package.json",
			"node_modules/ospec/ospec.js",
			"other.js",
			"package.json",
			"tests/main1.js",
			"tests/main2.js",
			"very/deep/tests/deep1.js",
			"very/deep/tests/deeper/deep2.js"
		]
	}, ({cwd, command, args, allFiles}) => {
		if (command !== "node") o("which", function() {
			o.timeout(10000)
			return execFile(command, ["run", "which"], {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})
				if (test) test(stdout)
			})
		})
		o("default", function() {
			o.timeout(10000)
			return execFile(command, args("default"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 1})
				o({stderr}).notDeepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o({correctNumberPassed: /All 2 assertions passed(?: \(old style total: \d+\))?\. Bailed out 2 times\s+$/.test(stdout)})
					.deepEquals({correctNumberPassed: true})
				if (test) test(stdout.match(/\n[^\n]+\n[^\n]+\n$/))

				const shouldRun = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])
				const shouldTest = new Set([
					"tests/main1.js",
					"tests/main2.js",
					"very/deep/tests/deep1.js",
					"very/deep/tests/deeper/deep2.js"
				])

				const shouldThrow = new Set([
					"tests/main2.js",
					"very/deep/tests/deep1.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, shouldThrow, cwd, stdout, stderr, allFiles})
			})
		})

		o("preload-one", function() {
			o.timeout(10000)
			return execFile(command, args("preload-one"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 1})
				o({"could not preload": stderr.includes("could not preload ./main.js")}).deepEquals({"could not preload": true})

				const test = o({assertionReport: /\d+ assertions (?:pass|fail)ed(?: \(old style total: \d+\))?\s+$/.test(stdout)})
					.deepEquals({assertionReport: false})
				if (test) test(stdout)

				const shouldRun = new Set([
					"main.js",
				])
				const shouldTest = new Set([
				])
				const shouldThrow = new Set([
					"main.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, shouldThrow, cwd, stdout, stderr, allFiles})
			})
		})
		o("preload-several", function() {
			o.timeout(10000)
			return execFile(command, args("preload-several"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 1})
				o({"could not preload": stderr.includes("could not preload ./main.js")}).deepEquals({"could not preload": true})

				// FIXME: revert this back to one line after next ospec update
				const test = o({assertionReport: /\d+ assertions (?:pass|fail)ed(?: \(old style total: \d+\))?\s+$/.test(stdout)})
					.deepEquals({assertionReport: false})
				if (test) test(stdout)

				const shouldRun = new Set([
					"main.js",
				])
				const shouldTest = new Set([
				])
				const shouldThrow = new Set([
					"main.js"
				])

				checkWhoRanAndHAdTests({shouldRun, shouldTest, shouldThrow, cwd, stdout, stderr, allFiles})
			})
		})
	})
	runningIn({
		scenario: "metadata",
		files: [
			"node_modules/dummy-module-with-tests-cjs/tests/should-not-run.js",
			"node_modules/ospec/bin/ospec",
			"node_modules/ospec/package.json",
			"node_modules/ospec/ospec.js",
			"package.json",
			"default1.js",
			"default2.js",
			"override.js",
		]
	}, ({cwd, command, args}) => {
		if (command !== "node") o("which", function() {
			o.timeout(10000)
			return execFile(command, ["run", "which"], {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})
				if (test) test(stdout)
			})
		})
		o("metadata", function() {
			o.timeout(10000)
			return execFile(command, args("metadata"), {cwd}).then(({code, stdout, stderr}) => {
				stderr = removeWarrnings(stderr)
				if (command === "yarn") stdout = removeYarnExtraOutput(stdout)

				o({code}).deepEquals({code: 0})
				o({stderr}).deepEquals({stderr: ""})

				// FIXME: revert this back to one line after next ospec update
				const test = o({correctNumberPassed: /All 3 assertions passed(?: \(old style total: \d+\))?\s+$/.test(stdout)})
					.deepEquals({correctNumberPassed: true})
				if (test) test(stdout.match(/\n[^\n]+\n[^\n]+\n$/))
				const files = [
					"default1.js", "default2.js", "override.js"
				]
				files.forEach((file) => {
					const fullPath = join(cwd, file)
					const metadataFile = file === "override.js" ? "foo" : fullPath

					check({
						haystack: stdout,
						needle: fullPath + " ran",
						label: "ran",
						expected: true
					})

					check({
						haystack: stdout,
						// __filename is also the name of the spec
						needle: fullPath + " > test metadata name from test",
						label: "metadata name from test",
						expected: true
					})

					check({
						haystack: stdout,
						needle: metadataFile + " metadata file from test",
						label: "metadata file from test",
						expected: true
					})

					check({
						haystack: stdout,
						needle: fullPath + " > test metadata name from assertion",
						label: "metadata name from assertion",
						expected: true
					})

					check({
						haystack: stdout,
						needle: metadataFile + " metadata file from assertion",
						label: "metadata file from assertion",
						expected: true
					})


				})
			})
		})
	})
})

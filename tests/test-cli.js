/* eslint-disable wrap-regex, no-process-env*/
"use strict"

const loadFromDeps = (
	typeof process !== "undefined"
	&& process.argv.length >= 2
	&& process.argv[1].match(/ospec-stable/)
)

const isWindows = process.platform === "win32"

const o = loadFromDeps ? require("ospec-stable") : require("../ospec")

const {copyFile, lstat, mkdir, readdir, rmdir, symlink, unlink, writeFile} = require("node:fs/promises")
const {join} = require("node:path")
const {performance} = require("node:perf_hooks")
const {spawnSync, spawn} = require("node:child_process")

const linkOrShim = isWindows ? require("cmd-shim") : symlink

const projectCwd = process.cwd()
const ospecPkgJsonPath = join(projectCwd, "package.json")
const ospecLibPath = join(projectCwd, "ospec.js")
const ospecBinPath = join(projectCwd, "bin/ospec")
const fixturesDir = join(projectCwd, "./tests/fixtures")

const parsed = /^v(\d+)\.(\d+)\./.exec(process.version)

const supportsESM = parsed && Number(parsed[1]) > 13 || Number(parsed[1]) === 13 && Number(parsed[2]) >= 2

const timeoutDelay = 20000

const moduleKinds = supportsESM
	? [
		"cjs",
		"esm",
	]
	: (console.log("Skipping ESM tests due to lack of platform support"), ["cjs"])
const commands = [
	"npm",
	"pnpm",
	"yarn"
].filter((launcher) => {
	try {
		return spawnSync(launcher, ["-v"], {shell: true}).status === 0
	} catch(e) {
		return false
	}
})
commands.unshift("ospec")

console.log(`Testing (${moduleKinds.join(" + ")}) x (${commands.join(" + ")})`)

function childPromise(child) {
	const err = []
	const out = []
	if (child.stdout) {
		child.stdout.on("data", (d) => out.push(d.toString()))
		child.stderr.on("data", (d) => err.push(d.toString()))
	}
	return Object.assign(new Promise(function (fulfill, _reject) {
		let code, signal
		const handler = (_code, _signal) => {
			code = _code, signal = _signal
			const result = {
				code,
				err: null,
				signal,
				stderr: err.join(""),
				stdout: out.join(""),
			}

			if (code === 0 && signal == null) fulfill(result)
			else {
				_reject(Object.assign(new Error("Problem in child process"), result))
			}
		}

		child.on("close", handler)
		child.on("exit", handler)
		child.on("error", (error) => {
			_reject(Object.assign((error), {
				code,
				err: error,
				signal,
				stderr: err.join(""),
				stdout: out.join(""),
			}))
			if (child.exitCode == null) child.kill("SIGTERM")
			setTimeout(() => {
				if (child.exitCode == null) child.kill("SIGKILL")
			}, 200)
		})
	}), {process: child})
}

// This returns a Promise augmented with a `process` field for raw
// access to the child process
// The promise resolves to an object with this structure
// {
// 	code? // exit code, if any
// 	signal? // signal recieved, if any
// 	stdout: string,
// 	stderr: string,
//  error?: the error caught, if any
// }
// On rejection, the Error is augmented with the same fields

const readFromCmd = (cmd, options) => (...params) => childPromise(spawn(cmd, params.filter((p) => p !== ""), {
	env: process.env,
	cwd: process.cwd(),
	...options
}))

// set PATH=%PATH%;.\node_modules\.bin
// cmd /c "ospec.cmd foo.js"

// $Env:PATH += ".\node_modules\.bin"
// ospec foo.js

function removeWarnings(stderr) {
	return stderr.split("\n").filter((x) => !x.includes("ExperimentalWarning") && !x.includes("npm WARN lifecycle")).join("\n")
}
function removeExtraOutputFor(command, stdout) {
	if (command === "yarn") return stdout.split("\n").filter((line) => !/^Done in [\d\.s]+$/.test(line) && !line.includes("yarnpkg")).join("\n")
	if (command === "pnpm") return stdout.replace(
		// eslint-disable-next-line no-irregular-whitespace
		/ERROR  Command failed with exit code \d+\./,
		""
	)
	return stdout
}
function checkIfFilesExist(cwd, files) {
	return Promise.all(files.map((list) => {
		const path = join(cwd, ...list.split("/"))
		return lstat(path).then(
			() => {o({found: true}).deepEquals({found: true})(path)}
		).catch(
			(e) => o(e.stack).equals(false)("sanity check failed")
		)
	}))
}

async function remove(path) {
	try {
		const stats = await lstat(path)
		if (stats.isDirectory()) {
			await Promise.all((await readdir(path)).map((child) => remove(join(path, child))))
			return rmdir(path)
		} else {
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
	await linkOrShim(join(ospecBinDir, "ospec"), join(dotBinPath, "ospec"))
}


function expandPaths(o, result, prefix = "") {
	for (const k in o) {
		const path = join(prefix, k)
		if(typeof o[k] === "string") result.push(path)
		else expandPaths(o[k], result, path)
	}
	return result
}

const pathVarName = Object.keys(process.env).filter((k) => /^path$/i.test(k))[0]

const env = {
	...process.env,
	[pathVarName]: (isWindows ? ".\\node_modules\\.bin;": "./node_modules/.bin:") + process.env[pathVarName]
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
					o.timeout(timeoutDelay)
					await remove(cwd)
					await createDir(config.js, cwd, mod)
					await createPackageJson(config["package.json"], cwd, mod)
					await createNodeModules(cwd, mod)
					// sanity checks
					await checkIfFilesExist(cwd, files)
					const snrPath = join(
						cwd, "node_modules", "dummy-module-with-tests-cjs", "tests", "should-not-run.js"
					)
					await readFromCmd("node", {cwd})(snrPath).then(
						({code, stdout, stderr}) => {
							stdout = stdout.replace(/\r?\n$/, "")
							stderr = removeWarnings(stderr)
							o({code}).deepEquals({code: 0})(snrPath)
							o({stdout}).deepEquals({stdout: `${snrPath} ran`})(snrPath)
							o({stderr}).deepEquals({stderr: ""})(snrPath)
						},
					)
				})
				commands.forEach((command) => {
					o.spec(command, () => {
						const {scripts} = config["package.json"]

						const run = ["npm", "pnpm", "yarn"].includes(command)
							? readFromCmd(command, {cwd, shell: true}).bind(null, "run")
							: (
								(scenario) => readFromCmd(command, {cwd, env, shell: true})(scripts[scenario].slice(6))
							)

						let before
						o.before(() => {
							console.log(`[ ${scenario} + ${mod} + ${command} ]`)
							before = performance.now()
						})
						o.after(() => console.log(`...took ${Math.round(performance.now()-before)} ms`))
						
						suite({allFiles, command, cwd, run: (arg) => run(arg)})
					})
				})
			})
		})
	})
}

function check({haystack, needle, label, expected}) {
	// const needle = join(cwd, file) + suffix
	const found = haystack.includes(needle)
	o({[label]: found}).deepEquals({[label]: expected})(haystack + "\n\nexpected: " + needle)
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
	}, ({cwd, command, run, allFiles}) => {
		if (/^(?:npm|pnpm|yarn)$/.test(command)) o("which", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("which"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})(stdout)
		})
		o("default", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("default"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 8 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("explicit-one", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("explicit-one"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 2 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

			const shouldRun = new Set([
				"explicit/explicit1.js",
			])
			const shouldTest = new Set([
				"explicit/explicit1.js",
			])

			checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
		})
		o("explicit-several", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("explicit-several"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 4 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("explicit-glob", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("explicit-glob"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 4 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("preload-one", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("preload-one"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 8 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("preload-several", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("preload-several"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 8 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("require-one", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("require-one"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: "Warning: The --require option has been deprecated, use --preload instead\n"})

			o(/All 8 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("require-several", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("require-several"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: "Warning: The --require option has been deprecated, use --preload instead\n"})

			o(/All 8 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("ignore-one", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("ignore-one"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 6 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("ignore-one-glob", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("ignore-one-glob"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 4 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

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
		o("ignore-several", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("ignore-several"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o(/All 2 assertions passed/.test(stdout)).equals(true)(stdout.match(/\n[^\n]+\n$/))

			const shouldRun = new Set([
				"tests/main1.js",
			])
			const shouldTest = new Set([
				"tests/main1.js",
			])

			checkWhoRanAndHAdTests({shouldRun, shouldTest, cwd, stdout, stderr, allFiles})
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
	}, ({cwd, command, run, allFiles}) => {
		if (/^(?:npm|pnpm|yarn)$/.test(command)) o("which", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("which"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})(stdout)
		})
		o("default", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("default"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}

			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 1})
			o({stderr}).notDeepEquals({stderr: ""})

			o({correctNumberPassed: /All 2 assertions passed(?: \(old style total: \d+\))?\. Bailed out 2 times\s+$/.test(stdout)})
				.deepEquals({correctNumberPassed: true})(stdout.match(/\n[^\n]+\n[^\n]+\n$/))

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

		o("preload-one", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("preload-one"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}

			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 1})
			o({"could not preload": stderr.includes("could not preload ./main.js")}).deepEquals({"could not preload": true})

			o({assertionReport: /\d+ assertions (?:pass|fail)ed/.test(stdout)})
				.deepEquals({assertionReport: false})(stdout)

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
		o("preload-several", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr;
			try {
				void ({code, stdout, stderr} = await run("preload-several"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 1})
			o({"could not preload": stderr.includes("could not preload ./main.js")}).deepEquals({"could not preload": true})

			o({assertionReport: /\d+ assertions (?:pass|fail)ed/.test(stdout)})
				.deepEquals({assertionReport: false})(stdout)

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
	}, ({cwd, command, run}) => {
		if (/^(?:npm|pnpm|yarn)$/.test(command)) o("which", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("which"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o({correctBinaryPath: stdout.includes(join(cwd, "node_modules/.bin/ospec"))}).deepEquals({correctBinaryPath: true})(stdout)
		})
		o("metadata", async function() {
			o.timeout(timeoutDelay)
			let code, stdout, stderr
			try {
				void ({code, stdout, stderr} = await run("metadata"))
			} catch (e) {
				void ({code, stdout, stderr} = e)
			}
			stderr = removeWarnings(stderr)
			stdout = removeExtraOutputFor(command, stdout)

			o({code}).deepEquals({code: 0})
			o({stderr}).deepEquals({stderr: ""})

			o({correctNumberPassed: /All 3 assertions passed/.test(stdout)})
				.deepEquals({correctNumberPassed: true})(stdout.match(/\n[^\n]+\n[^\n]+\n$/))
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

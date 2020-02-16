## Unit and integration tests

## End to end tests

The `fixtures/*/{esm, cjs}` subdiretcories contain pseudo-projects with the current code base defined as the `ospec` dependency, and js files in various directories.

Each direct `fixture` subdirectory contains a `config.js` file that is used to generate the pseudo-projects.

The `config` exports a `"package.json"` field (you'll never guess its purpose) and a `"js"` field that contains nested objects describing the layout of the JS files, and their content. 

While each directory has its peculiarirties (described hereafter), here is the common structure (after node_modules has been initialized):

```JS
{
      {
            "explicit" : [
                  "explicit1.js",
                  "explicit2.js",
            ]
      },
      "main.js",
      {
            "node_modules": {
                  ".bin": ["ospec" /*, ospec.cmd */],
                  "ospec": [
                        { bin: ["ospec"] },
                        "ospec.js",
                        "package.json"
                  ],
                  "dummy-package-with-tests": [
                        "package.json",
                        { tests: ["should-not-run.js"] }
                  ]
            }
      },
      "other.js",
      "package.json",
      {
            tests: ["main1.js", "main2.js"]
            very: { deep: { tests: [
                  "deep1.js", 
                  { deeper: ["deep2.js"] }
            ]}}
      }
}
```

- *success* has all the test files succeeding
- *throws* sees every file throw errors just after printing that they ran.
- TODO *failure* has all the test files filled with failing assertions
- TODO *lone-failure* has all but one assertion that succeeds in each directory

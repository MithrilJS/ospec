# ospec Release Processes

**Note** These steps all assume that `MithrilJS/ospec` is a git remote named `upstream`, adjust accordingly if that doesn't match your setup.

1. Ensure your local branch is up to date

```bash
$ git checkout next
$ git pull --rebase upstream master
```

2. Determine patch level of the change
3. Update `version` field in `package.json` to match new version being prepared for release.
4. Update `changelog.md` to match new version being prepared for release.
	- Don't forget to add today's date under the version heading!
5. Commit changes to `master`

```bash
$ git add .
$ git commit -m "v<version>"

# Push to your branch
$ git push

# Push to MithrilJS/ospec
$ git push upstream master
```

6. Ensure the tests are passing!

### Publish the release

7. Push the changes to `MithrilJS/ospec`

```bash
$ git push upstream master
```

8. Publish the changes to npm.

```bash
$ npm publish
```

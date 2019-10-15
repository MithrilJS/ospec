# Mithril Release Processes

**Note** These steps all assume that `MithrilJS/mithril.js` is a git remote named `mithriljs`, adjust accordingly if that doesn't match your setup.

- [Releasing a new Mithril version](#releasing-a-new-mithril-version)
- [Updating mithril.js.org](#updating-mithriljsorg)
- [Releasing a new ospec version](#releasing-a-new-ospec-version)

1. Ensure your local branch is up to date

```bash
$ git checkout next
$ git pull --rebase mithriljs master
```

2. Determine patch level of the change
3. Update `version` field in `ospec/package.json` to match new version being prepared for release.
4. Update `ospec/changelog.md` to match new version being prepared for release.
	- Don't forget to add today's date under the version heading!
5. Commit changes to `master`

```bash
$ git add .
$ git commit -m "v<version>"

# Push to your branch
$ git push

# Push to MithrilJS/mithril.js
$ git push mithriljs master
```

6. Ensure the tests are passing!

### Publish the release

7. Push the changes to `MithrilJS/mithril.js`

```bash
$ git push mithriljs master
```

8. Publish the changes to npm.

```bash
$ npm publish
```

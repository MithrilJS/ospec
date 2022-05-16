# Releasing ospec

This was originally tied to the Mithril release cycle, of which nothing remains.

Currently, the process is manual:

1. check that the test suite passes, both locally and in the GH actions (bar some timeout flakiness)
2. check that we're at the current `master` tip; if not, check it out and goto 1.
3. check that the git tree is clean; if not, check it out and goto 1.
4. verify that the change log is up to date. Update it if needed.
5. verify that the readme is up to date. Update it if needed (check the LOC stats and the API docs).
6. bump the version number in `package.json`.
7. commit, tag and push.
8. npm publish

9. \o/
    |
   / \

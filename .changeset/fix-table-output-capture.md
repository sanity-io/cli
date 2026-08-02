---
'@sanity/cli': patch
---

fix(cli): show table output when commands are run programmatically

Commands that render tables, such as `sanity users list`, produced no output when invoked programmatically instead of from a terminal. `sanity users list` now also reports when a project has no members rather than printing an empty table.

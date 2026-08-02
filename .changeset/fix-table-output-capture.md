---
'@sanity/cli': patch
---

Fixed table-based commands such as `sanity users list` returning no output when run programmatically instead of in a terminal. `sanity users list` now also reports when a project has no members rather than printing an empty table.

---
'@sanity/cli': patch
---

fix(cli): keep the users list table within the terminal width

The users list now wraps long names and roles instead of rendering a table wider than the terminal. Dates are shown as `YYYY-MM-DD` to keep the table compact.

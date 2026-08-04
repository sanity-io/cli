---
'@sanity/cli': patch
'@sanity/cli-core': patch
---

fix: ensure programmatic CLI calls don't use host lineage or debug configuration

Fixes a bug where programmatic CLI use would inherit the host's [Sanity lineage](https://www.sanity.io/docs/functions/functions-cheatsheet#k7a3b783ece7d) and `DEBUG` configuration

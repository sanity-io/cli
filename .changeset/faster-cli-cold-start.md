---
'@sanity/cli': patch
---

Reduce cold-start installation and initialization time by packaging portable CLI dependencies together and loading environment files without the build toolchain. Command-specific tools are downloaded on first use and cached locally for subsequent invocations. The package is bundled into a small number of files, and the update check reads the registry's dist-tags instead of the full package document.

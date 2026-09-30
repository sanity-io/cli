---
'@sanity/cli': patch
---

Reduce cold-start installation and initialization time by packaging portable CLI dependencies together and loading environment files without the build toolchain. Command-specific tools are downloaded on first use and cached locally for subsequent invocations.

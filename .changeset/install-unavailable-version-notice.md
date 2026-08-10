---
'@sanity/cli': patch
---

When a dependency install fails because a version was published but isn't installable yet, the CLI now names the version and explains that new releases are scanned before they become available, along with the command to retry. Previously this surfaced only as the package manager's raw "no matching version" output followed by `Dependency installation failed`, which reads like a broken dependency rather than a transient registry state.

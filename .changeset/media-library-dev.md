---
'@sanity/workbench-cli': patch
'@sanity/cli': patch
'@sanity/cli-build': patch
---

fix(workbench): run `sanity dev` for media library configs and render local views

- Route an `unstable_defineMediaLibrary` config through the workbench dev server so the shell starts and renders it
- Skip core app manifest extraction silently for config-only projects, dropping the misleading "Manifest creation skipped" warning
- Convert local dev view interfaces from `surface` to the remote's `type` wire shape, matching deployed apps

---
'@sanity/workbench-cli': minor
---

feat(workbench-cli): pause hidden federated apps through the render harness

The generated remote entry now wraps the app's tree in the remote's own React
`<Activity>` and exposes a lifecycle controller, so the workbench can pause a
federated app instead of just hiding it. `render()` still returns a callable
disposer, so existing hosts are unaffected.

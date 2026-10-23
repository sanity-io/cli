---
'@sanity/cli': minor
---

`sanity media pull-aspects` now offers to declare the generated fields in `sanity.cli.ts` (prompted interactively, or forced with `--update-config` / suppressed with `--no-update-config`), and `sanity init --template media-library-config` offers to seed the scaffold from the organization's existing aspects instead of the example fields. Deploying a config deletes stored aspects it does not declare, so both flows close the gap where pulled or pre-existing definitions were silently at risk.

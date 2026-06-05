---
'@sanity/cli': minor
---

Defer the `reactStrictMode` default for `sanity dev` to the `sanity` package. When `reactStrictMode` is unset in `sanity.cli.ts` and the `SANITY_STUDIO_REACT_STRICT_MODE` env var is absent, the CLI no longer forces a value; `renderStudio`'s own default decides instead. That default is off in Studio v5 and on in Studio v6. Explicit config and the env var still take effect. Opt out with `reactStrictMode: false` in `sanity.cli.ts` or by setting `SANITY_STUDIO_REACT_STRICT_MODE=false`.

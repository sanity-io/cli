---
"@sanity/cli": minor
---

New `sanity media prune-aspect-data <aspectName>` command (DAM-1877) — the deliberate counterpart to the deploy-time aspect sync, which only ever mirrors definitions. Run from a Media Library config app, it removes `aspects.<name>` values from every asset that carries them (drafts included). Irreversible fan-out mutation, so it never prompts: without `--yes` it only reports the affected assets, and it warns when the field is still declared in the config (data would grow back) or the stored definition still exists (data is removed, not the definition).

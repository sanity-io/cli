---
'@sanity/cli': minor
---

Show a runner-specific update command in the update notification when the CLI is invoked via npx, pnpm dlx, yarn dlx, or bunx. Also restores the "only notify once per version" dedupe that was unintentionally dropped when the update checker was rewritten to use a background worker, so the notification no longer fires on every invocation while an update is available.

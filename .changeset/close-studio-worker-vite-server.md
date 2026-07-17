---
"@sanity/cli-core": patch
"@sanity/cli": patch
---

fix(cli-core): prevent silent SIGABRT (exit 134) in `sanity schemas deploy` and other one-shot studio worker commands

With Vite 8, studio bundling runs through rolldown — a native addon with its own thread pool. The studio worker never closed its Vite server, and the main thread called `worker.terminate()` as soon as the worker posted its result, destroying the worker's event loop while rolldown's threads were still live. The next threadsafe-function call then aborted the whole process with no output (reliably on macOS, intermittently on Linux), affecting `schemas deploy`/`extract`/`validate`/`list`/`delete`, `graphql deploy`, `manifest extract`, and `deploy`.

One-shot studio workers now close their Vite server (bounded by a timeout) before posting their result — including on error paths, so a throwing `sanity.config.ts` surfaces its real error instead of exit 134 — and settled workers are unref'd and given a short grace period to exit on their own (override with `SANITY_WORKER_EXIT_GRACE_MS`) before being force-terminated as a last resort.

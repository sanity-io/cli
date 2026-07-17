---
"@sanity/cli-core": patch
"@sanity/cli": patch
---

fix(cli-core): prevent silent SIGABRT (exit 134) in `sanity schemas deploy` and other one-shot studio worker commands

With Vite 8, studio bundling runs through rolldown — a native addon with its own thread pool. The studio worker never closed its Vite server, and the main thread called `worker.terminate()` as soon as the worker posted its result, destroying the worker's event loop while rolldown's threads were still live. The next threadsafe-function call then aborted the whole process with no output (reliably on macOS, intermittently on Linux), affecting `schemas deploy`/`extract`/`validate`/`list`/`delete`, `graphql deploy`, `manifest extract`, and `deploy`.

One-shot studio workers now close their Vite server (bounded by a timeout) before posting any message to the main thread, and the main thread never force-terminates them — settled workers are unref'd and tear down with the process. Errors thrown while loading the studio config (e.g. a broken `sanity.config.ts`) are serialized and posted after cleanup, so the real error surfaces instead of exit 134.

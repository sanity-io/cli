---
'@sanity/groq-files': minor
---

Add a TypeScript 7.1 content mapper so `.groq` imports are typed from the live file contents with `tsc --runExternalCode`, without generating `*.d.groq.ts` files. Register it under `contentMappers` in `tsconfig.json`, with `schema` for one schema or `resources` for one schema per folder.

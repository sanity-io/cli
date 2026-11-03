---
name: sanity-app-sdk
description: Build features with the Sanity App SDK (@sanity/sdk-react) and Sanity UI. Use when adding components, fetching or editing Sanity content, or working with hooks like useDocuments, useDocument, useDocumentProjection, useEditDocument, or useQuery.
---

# Sanity App SDK

## Set up TypeGen before writing components

Set up Sanity TypeGen before you write components that read content. SDK hooks then infer document, projection and query result types from the project and dataset, so do not hand-write those types or pass them as type parameters. This workflow is in beta and needs `@sanity/cli` 8.16.0 or later. Check with `npx sanity --version`.

1. Get a schema file for each dataset the app reads. In the Studio that defines the schema, run `npx sanity schema extract --path schema.production.json` and copy the file into this app's root. If you can't reach the Studio, ask the developer for the file. If you must continue without it, extract one from a temporary Studio config that matches the schema the developer described, and tell the developer to replace it with the real extract, because types from a stand-in schema can be wrong.
2. Declare the datasets in `src/resources.ts`. Use the same object for the `SanityApp` config in `src/App.tsx` and in every hook call. `as const` keeps the IDs as literal types, which inference needs. The CLI loads this file in Node, so it must not use browser globals.

   ```ts
   import type {DocumentResource} from '@sanity/sdk-react'

   export const resources = {
     production: {projectId: 'your-project-id', dataset: 'production'},
   } as const satisfies Record<string, DocumentResource>
   ```

3. Add `typegen.resources` to `sanity.cli.ts`, next to the existing `app` config. Each entry writes one types file for one dataset:

   ```ts
   import {resources} from './src/resources'

   export default defineCliConfig({
     // ...existing app config
     typegen: {
       resources: [
         {
           ...resources.production,
           schema: './schema.production.json',
           generates: './src/sanity.types.production.ts',
         },
       ],
     },
   })
   ```

4. Add `"typegen": "sanity typegen generate"` to the `package.json` scripts and run `npm run typegen`. Run it again after changing a schema, query or projection. `npm run dev` does not generate these types. While developing, run `npx sanity typegen generate --watch` (`@sanity/cli` 8.22.0 or later) alongside it.
5. Define queries with `defineQuery` from `groq` (`npm install groq`) and projections with `defineProjection` from `@sanity/sdk-react`, each assigned to a variable. TypeGen only generates types for those. Then call hooks without type parameters:

   ```tsx
   export const bookRowProjection = defineProjection('book', '{title, "authorName": author->name}')

   const {data: handles} = useDocuments({...resources.production, documentType: 'book'})

   // in a child component receiving one handle (typed DocumentHandle<'book'>):
   const {data} = useDocumentProjection({...handle, projection: bookRowProjection})
   // data is typed from the generated file
   ```

Guide: https://www.sanity.io/docs/app-sdk/sdk-typegen

## Get the maintained guide first

If the Sanity MCP server is configured, call its `get_sanity_rules` tool with the `app-sdk` rule before writing SDK code. That rule is maintained by Sanity, is more detailed, and supersedes the notes below. The notes below are a fallback for when MCP is not available.

## Picking a hook

- `useDocuments` / `usePaginatedDocuments`: lists of documents. Returns document handles, not full documents.
- `useDocumentProjection`: read specific fields from a handle, for display.
- `useDocument` plus `useEditDocument`: read and write a single document in real time.
- `useQuery`: raw GROQ. Use sparingly; prefer handles plus projections.

## Document handles

Fetch handles first, then spread them into other hooks:

```tsx
const {data} = useDocuments({documentType: 'article'})

// in a child component receiving one handle:
const {data: fields} = useDocumentProjection({...handle, projection: '{title}'})
```

Use `documentId` as the React key when rendering lists, never the array index.

## Suspense

Data hooks suspend while loading. Wrap every data-fetching component in `<Suspense>` with a fallback, keep one fetching hook per component, and always pass a `fallback` to `SanityApp`. All SDK hooks must be used inside `SanityApp`.

## Editing

Write through `useEditDocument` on change so content stays in sync with the Content Lake:

```tsx
const {data: title} = useDocument({...handle, path: 'title'})
const editTitle = useEditDocument({...handle, path: 'title'})
// <input value={title ?? ''} onChange={(e) => editTitle(e.currentTarget.value)} />
```

Do not hold document field values in `useState` and save on submit. That pattern goes stale and loses concurrent edits.

## Sanity UI

This app wraps everything in Sanity UI's `ThemeProvider` (see `src/SanityUI.tsx`, built with `buildTheme()`). Build UI with Sanity UI primitives like `Card`, `Stack`, `Flex`, `Text`, and `Button`. See https://www.sanity.io/docs/app-sdk/sanity-ui-sdk and https://www.sanity.io/ui.

## Documentation

Fetch these for current detail rather than relying on the notes above:

- Best practices: https://www.sanity.io/docs/app-sdk/sdk-best-practices
- Editing documents: https://www.sanity.io/docs/app-sdk/editing-documents
- Configuration: https://www.sanity.io/docs/app-sdk/sdk-configuration
- Deployment: https://www.sanity.io/docs/app-sdk/sdk-deployment
- API reference with current signatures: https://reference.sanity.io/_sanity/sdk-react/

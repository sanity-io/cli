# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

A React application built with the Sanity App SDK (`@sanity/sdk-react`) and Sanity UI (`@sanity/ui`). It is not a Sanity Studio. The app reads and writes content in a Sanity project through SDK hooks, and runs inside the organization's Sanity Dashboard, in development and when deployed. The `sanity` CLI runs it with Vite under the hood.

The app is set up for the Sanity Dashboard beta: `sanity.cli.ts` declares it with `defineApplication`.

## Key files

- `src/App.tsx`: entry point. The `SanityApp` component takes a `config` array with `projectId` and `dataset`. All SDK hooks must be used inside `SanityApp`.
- `src/SanityUI.tsx`: wraps the app in Sanity UI's `ThemeProvider` with a theme from `buildTheme()`. Sanity UI components must render inside this provider.
- `sanity.cli.ts`: CLI config. `app` is `defineApplication({title, slug, organizationId, entry})`. `slug` is the app's unique address in the organization, used to create the app on its first deploy: lowercase letters, numbers and hyphens, starting with a letter.

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

## Commands

- `npm run dev`: starts a local Sanity Dashboard on port 3333 and serves the app on the next port (3334), loaded into that Dashboard. The CLI prints a link that opens the app in the local Dashboard. The app only renders inside the Dashboard, and viewing it requires a signed-in Sanity account, so a human must complete authentication in the browser.
- `npm run build`: production build.
- `npm run deploy`: deploy to the organization's Sanity Dashboard.

Environment variables prefixed with `SANITY_APP_` are bundled into the app.

## Deploying without prompts

The first deploy creates the app from `slug` and `title` in `defineApplication`. Do not pass `--create`; it is rejected for this config.

```bash
npm run deploy -- --yes --json
```

`--title` overrides `app.title`. Add `--dry-run` to preview the deployment without creating or uploading anything. A first deploy cannot use `--no-build`, because the new app ID is built into the bundle.

Save `application.id` from the JSON response as `deployment.appId` in `sanity.cli.ts`. Later deploys use the same command and update that app. Without `deployment.appId`, a later deploy fails because the slug is already taken; the error includes the app ID to save.

A deployed app is served at `https://<organizationId>.sanity.run/applications/<appId>`.

Agent terminals may disable interactive prompts even with a PTY (`TERM=dumb`). Use these flags rather than changing terminal settings or calling the applications API directly. Run `npm run deploy -- --help` to check which flags the installed CLI supports.

This app is not a Studio. For a Studio's first hosted deployment, use `sanity deploy --url <hostname> --yes`; `studioHost`, if used in config, belongs at the top level, not inside `deployment`.

## Working with the App SDK

If the Sanity MCP server is available, call its `get_sanity_rules` tool with the `app-sdk` rule before writing SDK code. That rule is the maintained guide and supersedes the notes below.

Essentials:

- Data hooks suspend while loading. Wrap every data-fetching component in `<Suspense>`, keep one fetching hook per component, and always pass a `fallback` to `SanityApp`.
- Fetch lists with `useDocuments` (or `usePaginatedDocuments`). They return document handles, not full documents. Spread a handle into `useDocumentProjection` to display fields, or into `useDocument` and `useEditDocument` for real-time editing.
- Use `documentId` as the React key when rendering document lists, never the array index.
- Do not hold document field values in `useState` and save on submit. Write through `useEditDocument` on change so content stays in sync with the Content Lake.
- Prefer handles plus projections over raw GROQ. Reach for `useQuery` only when a complex query genuinely needs it.
- Build UI with Sanity UI primitives like `Card`, `Stack`, `Flex`, `Text`, and `Button` for a look consistent with Sanity tooling.
- Hooks that talk to the Dashboard itself are imported from `@sanity/sdk-react/dashboard`, not `@sanity/sdk-react`. Examples: `useNavigate`, `useOrganizationId`, `useApplications`, `useApplication`, `useWindowTitle`, `useNavigateToStudioDocument`.

## Documentation

- App SDK docs: https://www.sanity.io/docs/app-sdk
- Best practices: https://www.sanity.io/docs/app-sdk/sdk-best-practices
- Editing documents: https://www.sanity.io/docs/app-sdk/editing-documents
- Configuration: https://www.sanity.io/docs/app-sdk/sdk-configuration
- Sanity UI with the App SDK: https://www.sanity.io/docs/app-sdk/sanity-ui-sdk
- Sanity UI docs: https://www.sanity.io/ui
- API reference with current signatures: https://reference.sanity.io/_sanity/sdk-react/

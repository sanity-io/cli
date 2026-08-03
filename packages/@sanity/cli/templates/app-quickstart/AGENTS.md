# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

A React application built with the Sanity App SDK (`@sanity/sdk-react`). It is not a Sanity Studio. The app reads and writes content in a Sanity project through SDK hooks, and runs inside the organization's Sanity Dashboard, in development and when deployed. The `sanity` CLI runs it with Vite under the hood.

## Key files

- `src/App.tsx`: entry point. The `SanityApp` component takes a `config` array with `projectId` and `dataset`. All SDK hooks must be used inside `SanityApp`.
- `sanity.cli.ts`: CLI config with the organization ID and app entry path.

## Commands

- `npm run dev`: starts the dev server on port 3333, but the app only renders inside the Sanity Dashboard. The CLI prints a Dashboard URL to open. Viewing it requires a signed-in Sanity account, so a human must complete authentication in the browser.
- `npm run build`: production build.
- `npm run deploy`: deploy to the Sanity Dashboard.

Environment variables prefixed with `SANITY_APP_` are bundled into the app.

## Working with the App SDK

If the Sanity MCP server is available, call its `get_sanity_rules` tool with the `app-sdk` rule before writing SDK code. That rule is the maintained guide and supersedes the notes below.

Essentials:

- Data hooks suspend while loading. Wrap every data-fetching component in `<Suspense>`, keep one fetching hook per component, and always pass a `fallback` to `SanityApp`.
- Fetch lists with `useDocuments` (or `usePaginatedDocuments`). They return document handles, not full documents. Spread a handle into `useDocumentProjection` to display fields, or into `useDocument` and `useEditDocument` for real-time editing.
- Use `documentId` as the React key when rendering document lists, never the array index.
- Do not hold document field values in `useState` and save on submit. Write through `useEditDocument` on change so content stays in sync with the Content Lake.
- Prefer handles plus projections over raw GROQ. Reach for `useQuery` only when a complex query genuinely needs it.

## Documentation

- App SDK docs: https://www.sanity.io/docs/app-sdk
- Best practices: https://www.sanity.io/docs/app-sdk/sdk-best-practices
- Editing documents: https://www.sanity.io/docs/app-sdk/editing-documents
- Configuration: https://www.sanity.io/docs/app-sdk/sdk-configuration
- API reference with current signatures: https://reference.sanity.io/_sanity/sdk-react/

---
name: sanity-app-sdk
description: Build features with the Sanity App SDK (@sanity/sdk-react). Use when adding components, fetching or editing Sanity content, or working with hooks like useDocuments, useDocument, useDocumentProjection, useEditDocument, or useQuery.
---

# Sanity App SDK

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

## Documentation

Fetch these for current detail rather than relying on the notes above:

- Best practices: https://www.sanity.io/docs/app-sdk/sdk-best-practices
- Editing documents: https://www.sanity.io/docs/app-sdk/editing-documents
- Configuration: https://www.sanity.io/docs/app-sdk/sdk-configuration
- Deployment: https://www.sanity.io/docs/app-sdk/sdk-deployment
- API reference with current signatures: https://reference.sanity.io/_sanity/sdk-react/

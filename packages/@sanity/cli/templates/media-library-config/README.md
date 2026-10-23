# Media Library config app

A **Media Library config app**: it defines custom fields (aspects) for your
organization's Sanity Media Library. It has no UI of its own — the CLI
bundles the field modules in `src/fields/` into a remote that the Media
Library loads to drive asset metadata editing.

## Commands

- `npm run dev` starts the dev server and prints a Sanity Dashboard URL.
  Open it, sign in, and go to the Media Library — the fields defined here
  appear on assets, served live from your machine.
- `npm run build` builds the config for production.
- `npm run deploy` deploys the config to your organization.

## Defining fields

Each field lives in `src/fields/<name>.tsx` as a default-exported
`defineField(...)` — the same API as Sanity Studio — and is registered in
`sanity.cli.ts` under `fields`. Two examples are included:

- `caption` — a plain field rendered by the Media Library's standard
  controls, with validation and an initial value.
- `notes` — a field with a custom input component (`components.input`).

The `name` of a field must match its entry in `sanity.cli.ts`: it becomes
the key the field's data is stored under on assets.

## Custom input components

Custom inputs render as **islands**: isolated React roots using this app's
own bundled `react`, `@sanity/ui`, and `sanity` copies — no version coupling
with the Media Library itself. The rules that keep an input working inside
an island are documented in `src/fields/notes.tsx`; the supported `sanity`
import surface is enforced at lint time by the override in
`eslint.config.mjs`. An import outside that surface has no provider inside
the island and fails at runtime.

## Validation and initial values

Validation rules and `initialValue` resolvers are config code executed by
the Media Library. `initialValue` runs when a new asset is uploaded;
resolver functions receive `(params, context)` where `context` carries the
uploaded asset document and its instance document (e.g. image metadata).

## Field modules must be loadable under plain Node.js

Field definitions are evaluated outside the browser when the config is
synchronized. Browser-only libraries that touch `window` at import time must
be loaded lazily from a component module
(`lazy(() => import('./MapInput'))`), never imported at the top of a field
module.

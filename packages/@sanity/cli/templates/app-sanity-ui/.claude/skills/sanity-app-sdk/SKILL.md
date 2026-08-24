---
name: sanity-app-sdk
description: Build features with the Sanity App SDK (@sanity/sdk-react) and Sanity UI. Use when adding components, fetching or editing Sanity content, or working with hooks like useDocuments, useDocument, useDocumentProjection, useEditDocument, or useQuery.
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

## Sanity UI

This app wraps everything in Sanity UI's `ThemeProvider` (see `src/SanityUI.tsx`, built with `buildTheme()`). Build UI with Sanity UI primitives like `Card`, `Stack`, `Flex`, `Text`, and `Button`. See https://www.sanity.io/docs/app-sdk/sanity-ui-sdk and https://www.sanity.io/ui.

### Spacing scale

Sanity UI uses a numeric scale (0–9) for all spacing-related props. The scale follows a Fibonacci progression — not a linear 4px step — so the gaps widen as values increase. Apply it through:

- `padding`, `paddingX` / `paddingY`, and directional equivalents (`paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`) on `Box`, `Card`, `Flex`, `Stack`
- `margin`, `marginX` / `marginY`, and directional equivalents on the same components
- `space` on `Stack` (v3) or `gap` on `Stack`, `Flex`, `Inline` (v4) for the gap between children

Scale values and their typical uses:

| Value | Size | Common use |
|-------|------|------------|
| `0`   | 0px  | Reset / flush |
| `1`   | 4px  | Icon gap, tight inline spacing |
| `2`   | 8px  | Between closely related items |
| `3`   | 12px | Form field gap, list item gap |
| `4`   | 20px | Card internal padding, standard gap |
| `5`   | 32px | Section padding, prominent gap |
| `6`   | 52px | Page-level padding |
| `7`   | 84px | Large layout gap |

All spacing props also accept an array for responsive values — `[mobile, tablet, desktop]`:

```tsx
<Card padding={[3, 4, 5]}>
  {/* 12px on mobile, 20px on tablet, 32px on desktop */}
</Card>
```

### Vertical rhythm

Maintain vertical rhythm by spacing siblings through a parent `Stack` rather than individual `margin` props on each child. Choose a single scale value for a section and use it uniformly:

```tsx
// Good: rhythm lives in one place, easy to change globally
<Stack space={4}>
  <Heading size={2}>Title</Heading>
  <Text>Body paragraph.</Text>
  <Button>Action</Button>
</Stack>

// Avoid: scattered margins are hard to keep consistent
<Heading size={2} marginBottom={4}>Title</Heading>
<Text marginBottom={4}>Body paragraph.</Text>
```

Use nested `Stack`s to express hierarchy — a tighter inner `space` groups related items, a looser outer `space` separates sections:

```tsx
<Stack space={5}>
  <Stack space={2}>
    <Label size={1} muted>Category</Label>
    <Heading size={3}>Article title</Heading>
  </Stack>
  <Text>Introductory paragraph...</Text>
</Stack>
```

### Typography and the `trim` prop

`Text`, `Heading`, and `Label` all accept:

- `size`: numeric type scale (0–4 for `Text`, 0–5 for `Heading`)
- `weight`: `"regular"`, `"medium"`, `"semibold"`, `"bold"`
- `muted`: renders in muted colour for secondary or supporting content
- `align`: `"left"`, `"center"`, `"right"`

#### The `trim` prop

`Text`, `Heading`, and `Label` also accept a `trim` prop (number, `0` or `1`). Without trimming, every text element has invisible vertical space above the cap-height and below the baseline introduced by the line-height. This "phantom padding" makes precise vertical alignment hard and inflates the perceived spacing in tightly packed layouts.

`trim={1}` removes that extra space, making the component's bounding box flush with the visible type:

```tsx
// Without trim: bounding box includes line-height padding above and below
<Text size={1}>Status</Text>

// With trim: bounding box sits at cap-height (top) and baseline (bottom)
<Text size={1} trim={1}>Status</Text>
```

**Use `trim={1}` when:**

- Aligning text next to an icon — trimmed text centres on the icon glyph without manual offset nudging
- Spacing should be measured from the visible glyph edge, not from the line-height box
- Building tight card layouts where `padding` on the parent should visually reach the first character

```tsx
// Trimmed text aligns correctly with an icon in a Flex
<Flex align="center" gap={2}>
  <CheckmarkCircleIcon />
  <Text size={1} weight="medium" trim={1}>Saved</Text>
</Flex>
```

**Avoid `trim` when:**

- Rendering flowing prose — the natural leading improves readability across multiple lines
- The text wraps to more than one line — trimming only affects the first and last lines, which can look uneven
- Inside a `Stack` where the outer spacing already accounts for line-height

## Documentation

Fetch these for current detail rather than relying on the notes above:

- Best practices: https://www.sanity.io/docs/app-sdk/sdk-best-practices
- Editing documents: https://www.sanity.io/docs/app-sdk/editing-documents
- Configuration: https://www.sanity.io/docs/app-sdk/sdk-configuration
- Deployment: https://www.sanity.io/docs/app-sdk/sdk-deployment
- API reference with current signatures: https://reference.sanity.io/_sanity/sdk-react/

/**
 * The Media Library configuration lifecycle — pure serialization and mirror
 * semantics, vendored from huey's `@repo/media-library-config` (the package
 * that proved the contract; see DAM-1369/DAM-1586/DAM-1821). Keep the two
 * copies behaviorally identical until huey's standalone sync bin is retired
 * in favor of `sanity deploy`.
 *
 * A media library's aspect fields are declared as *field modules* in a config
 * app's `sanity.cli.ts` (`unstable_defineMediaLibrary({fields: [...]})`).
 * Environments that evaluate the config app live (the Workbench) get the full
 * definitions — custom inputs, validation callbacks, initial-value resolvers.
 * Everything else (Studio plugin mode, standalone dashboard, Gradient) reads
 * stored `sanity.asset.aspect` documents instead.
 *
 * This module owns the contract between those two worlds:
 *
 * - **Serialization** (`serializeField`): field modules are live JS, stored
 *   aspect documents are JSON. Literal values pass through; functions and
 *   component references are stripped deterministically, with every stripped
 *   path reported so the capability gap is explicit.
 * - **Mirror semantics** (`computeMirrorDiff`, `buildSyncMutations`): the
 *   config app is the source of truth for the aspect namespace. A sync
 *   upserts every config field; stored aspect documents without a matching
 *   config field are *stale* and are deleted to complete the mirror. Deleting
 *   an aspect document removes the definition, not asset data — values remain
 *   on assets under `aspects.<name>` and reappear if the field is restored.
 *
 * This module is pure (no I/O); composition with the CLI's API services lives
 * in `./syncAspects.ts`.
 */

/** The document type stored aspect definitions use. */
export const ASPECT_TYPE = 'sanity.asset.aspect'

/**
 * The shape an aspect name must have. Names double as document `_id`s and as
 * the `aspects.<name>` key on asset documents, and get interpolated into
 * GROQ by tooling, so the same rule guards all three.
 */
const VALID_ASPECT_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/

/**
 * A field entry as declared in a media-library config app's `sanity.cli.ts`.
 */
export interface FieldEntry {
  name: string
  src: string

  public?: boolean
  title?: string
}

/**
 * The `sanity.asset.aspect` *write payload* produced by a sync.
 *
 * This is deliberately not `MediaLibraryAssetAspectDocument` from
 * `@sanity/types` — that is the read-side type: it carries required
 * server-assigned `_rev`/`_createdAt`/`_updatedAt` (which a to-be-written
 * document does not have) and types `definition` as a full `FieldDefinition`,
 * which the serializer's stripped-JSON output is only guaranteed to be after
 * schema validation. Read-side documents can be passed to
 * {@link computeMirrorDiff} (it only needs ids), but upserts via
 * {@link buildSyncMutations} require this write shape — echoing read-side
 * server metadata back into a `createOrReplace` would be a bug.
 */
export interface AspectDocument {
  _id: string
  _type: typeof ASPECT_TYPE
  definition: Record<string, unknown>

  public?: boolean
}

/**
 * Result of serializing a live field definition into a stored document.
 */
export interface SerializedField {
  document: AspectDocument
  /** Dot-paths of values dropped because they are not JSON-serializable. */
  stripped: string[]
}

/** One mutation in a sync transaction (see {@link buildSyncMutations}). */
export type SyncMutation =
  | {createOrReplace: AspectDocument}
  | {delete: {params: {id: string; type: string}; query: string}}

/**
 * Serialize a field module's live `defineField(...)` value into a stored
 * aspect document.
 *
 * The `_id` convention is the field/aspect name, matching the legacy
 * `sanity media deploy-aspect` command (its delete targets `id == name`).
 */
export function serializeField(entry: FieldEntry, definition: unknown): SerializedField {
  if (!VALID_ASPECT_NAME.test(entry.name)) {
    throw new Error(
      `"${entry.name}" is not a valid aspect name (${VALID_ASPECT_NAME}) — it becomes the document _id and the aspects.<name> key on assets`,
    )
  }
  if (
    !definition ||
    typeof definition !== 'object' ||
    typeof (definition as {name?: unknown}).name !== 'string' ||
    typeof (definition as {type?: unknown}).type !== 'string'
  ) {
    throw new Error(
      `Field "${entry.name}" must be a defineField(...) value (an object with name and type)`,
    )
  }

  const definitionName = (definition as {name: string}).name
  // A mismatch must not serialize: `entry.name` becomes the document _id
  // (mirror upserts/deletes) while `definition.name` becomes the
  // aspects.<name> data key on assets — a document carrying both would have
  // its data under one name and its lifecycle under another.
  if (definitionName !== entry.name) {
    throw new Error(
      `Field "${entry.name}": its field module defines name "${definitionName}" — the names must match`,
    )
  }

  const stripped: string[] = []
  const serialized = serializeValue(definition, 'definition', stripped) as Record<string, unknown>

  return {
    document: {
      _id: entry.name,
      _type: ASPECT_TYPE,
      definition: serialized,
      // Strict boolean check, mirroring the read-side guard in the Media
      // Library app: `entry` is a runtime value from a config app, and a
      // mistyped `public: 'false'` must not serialize into the stored doc
      // where later Boolean(...) coercion would flip the aspect to public.
      ...(typeof entry.public === 'boolean' ? {public: entry.public} : {}),
    },
    stripped,
  }
}

/**
 * Deterministic strip rule: literal values pass through; functions (initial
 * value resolvers, validation callbacks, input components) and other
 * non-JSON values are dropped with their path recorded. The `components` key
 * is dropped wholesale — it is UI-only and never meaningful in a stored doc.
 *
 * `ancestors` holds the objects on the current recursion path: revisiting one
 * means a cycle, which is stripped like any other non-JSON value (instead of
 * overflowing the stack). Shared acyclic references serialize at every site.
 */
function serializeValue(
  value: unknown,
  atPath: string,
  stripped: string[],
  ancestors: Set<object> = new Set(),
): unknown {
  if (value === null) return null
  const kind = typeof value
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value
  if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined') {
    stripped.push(atPath)
    return undefined
  }
  if (ancestors.has(value as object)) {
    stripped.push(atPath)
    return undefined
  }
  if (Array.isArray(value)) {
    ancestors.add(value)
    const out: unknown[] = []
    for (const [index, item] of value.entries()) {
      const serialized = serializeValue(item, `${atPath}[${index}]`, stripped, ancestors)
      if (serialized !== undefined) out.push(serialized)
    }
    ancestors.delete(value)
    return out
  }
  if (kind === 'object') {
    // React elements / memo components etc. are tagged objects, not plain data
    if ((value as {$$typeof?: unknown}).$$typeof) {
      stripped.push(atPath)
      return undefined
    }
    // Dates, RegExps, Maps etc. would walk to `{}` (no enumerable own keys)
    // without ever being reported — strip anything that isn't a plain object
    // so the "every stripped path reported" contract holds.
    const proto = Object.getPrototypeOf(value) as object | null
    if (proto !== Object.prototype && proto !== null) {
      stripped.push(atPath)
      return undefined
    }
    ancestors.add(value as object)
    const out: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'components') {
        stripped.push(`${atPath}.components`)
        continue
      }
      const serialized = serializeValue(entryValue, `${atPath}.${key}`, stripped, ancestors)
      if (serialized !== undefined) out[key] = serialized
    }
    ancestors.delete(value as object)
    return out
  }
  stripped.push(atPath)
  return undefined
}

/**
 * Mirror semantics: given the documents a config declares and the ids stored
 * in the library, compute which stored documents are stale (present in the
 * library, absent from the config) and must be deleted for the library to
 * mirror the config.
 */
export function computeMirrorDiff(
  configDocuments: readonly {_id: string}[],
  storedIds: readonly string[],
): {staleIds: string[]} {
  const configIds = new Set(configDocuments.map((doc) => doc._id))
  return {staleIds: storedIds.filter((id) => !configIds.has(id))}
}

/**
 * Build the mutation transaction for one sync: upsert every config document,
 * delete every stale stored document. The delete shape matches the CLI's
 * `deleteAspect` (`sanity media delete-aspect`).
 */
export function buildSyncMutations(
  configDocuments: readonly AspectDocument[],
  staleIds: readonly string[],
): SyncMutation[] {
  return [
    ...configDocuments.map((document) => ({createOrReplace: document})),
    ...staleIds.map((id) => ({
      delete: {
        params: {id, type: ASPECT_TYPE},
        query: `*[_type == $type && _id == $id]`,
      },
    })),
  ]
}

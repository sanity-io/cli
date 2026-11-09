/**
 * The shape an aspect/field name must have — the single source for every
 * consumer. Names double as the stored `sanity.asset.aspect` document `_id`
 * and as the `aspects.<name>` data key on asset documents, and get
 * interpolated into GROQ by tooling, so the same rule guards all three.
 */
export const VALID_ASPECT_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/

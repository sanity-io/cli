# `sanity api` — Product & Engineering Spec

Status: draft
Owner: Gustav Hansen
Last updated: 2026-05-11

---

## 1. Context

We're extending the Sanity CLI with first-class access to the 23 public OpenAPI specs at `sanity.io/docs/http-reference`. The primary consumers are (a) **agents** (Claude Code, Cursor, MCP clients) that need to discover the long-tail API surface MCP can't cover, and (b) **developers** who want one command from "I need this API" to "request is executing." The design borrows the converged shape of `gh api` and `vercel api`, tailored to Sanity's date-versioned, multi-host, project-scoped surface.

**Current state of the repo (verified 2026-05-11):**

- `packages/@sanity/cli/src/commands/openapi/list.ts` — lists specs via `https://www.sanity.io/docs/api/openapi`. Flags: `--json`, `--web`. Shipped April 2026.
- `packages/@sanity/cli/src/commands/openapi/get.ts` — fetches single spec via `https://www.sanity.io/docs/api/openapi/<slug>?format=yaml|json`. Flags: `--format`, `--web`.
- Tests live in `packages/@sanity/cli/src/commands/openapi/__tests__/`.

The docs endpoint already wraps the underlying Sanity dataset (`3do82whm/next`) and is owned by the docs team — we treat it as the stable contract and don't bypass it.

---

## 2. Goals

- Make every public-spec operation discoverable from the terminal the day it ships, with no CLI release in between.
- Give agents a uniform `list → spec → call` flow for the operations MCP can't or shouldn't carry.
- Generate ranked, observed-demand data for which uncovered operations MCP should promote next.
- Stay strictly within the publicly-committed 23-spec surface — no path that exposes `openapi.sanity.build`.

**Operating principle: every behavior is reachable via flags; no command requires interactive input.** Interactive prompts (e.g. destructive-action confirmation in a TTY) are conveniences for humans, never gates. Agents always have a flag-driven path. Humans get sensible defaults; agents get explicit flags for every override. If a code path requires stdin or a TTY without a corresponding flag, that's a spec bug.

## 3. Non-goals (v1)

- GraphQL endpoint shortcut (`gh api graphql` analog) — Sanity uses GROQ via existing `sanity documents query`.
- Internal-spec discovery / `--include-internal` flag.
- Multi-host / "Enterprise" routing — Sanity is single-host.
- Write-method UX polish (response coercion, retry strategies) — covered after raw `call` lands.
- A Go-template output mode (`gh api -t`) — `--json | jq` covers it.

---

## 4. Namespace decision (resolved)

**`sanity api` is the canonical namespace; `sanity openapi` is deprecated.**

| Namespace        | Status                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sanity api`     | Canonical. All new commands land here. Discover endpoints (`list`), inspect operations + params (`spec`), call them (`<endpoint>`), refresh cache (`refresh`).                                      |
| `sanity openapi` | **Deprecated for one minor version**, then removed. Existing `openapi list` and `openapi get` continue to work but each invocation emits a stderr deprecation warning naming the `api` replacement. |

Why deprecate rather than coexist:

- The original two-namespace design (`openapi` = browse docs; `api` = use the API) drew a real distinction, but **`sanity api spec`'s flag-driven output covers both audiences in one command** — the structured human view (default) for humans skimming references, `--format=openapi` for the raw-spec consumer who used to reach for `openapi get`. There's no remaining user pain that `openapi` solves and `api` doesn't.
- Two namespaces for the same content surface invites drift, tab-completion noise, and "which one should I use?" indecision in docs and tutorials.
- `openapi list` and `openapi get` shipped April 2026 — small enough consumer surface that a one-cycle deprecation is cheap.

Migration map (printed verbatim in the deprecation warning):

| Old                                       | New                                                     |
| ----------------------------------------- | ------------------------------------------------------- |
| `sanity openapi list`                     | `sanity api list`                                       |
| `sanity openapi get <slug>`               | `sanity api spec <slug>` _(default human view)_         |
| `sanity openapi get <slug> --format=yaml` | `sanity api spec <slug> --format=openapi`               |
| `sanity openapi get <slug> --format=json` | `sanity api spec <slug> --format=openapi \| yq -o=json` |

Implementation: `commands/openapi/{list,get}.ts` become thin forwarders that print the deprecation warning to stderr, then delegate to the canonical `commands/api/{list,spec}.ts` implementation. They share the same shared-internals module (Section 5.4), so behavior parity is automatic. Removed at the next major version.

**Canonical command surface (`sanity api spec`):**

| Invocation         | Output                                                  |
| ------------------ | ------------------------------------------------------- |
| _(no flag)_        | Structured human-readable per-operation view (default). |
| `--format=json`    | Structured per-operation JSON (agent-friendly).         |
| `--format=openapi` | Raw OpenAPI spec, YAML.                                 |

One `--format=<json\|openapi>` flag instead of two orthogonal `--json` / `--openapi` flags. Default (no flag) renders the structured human view; `--format` picks a machine-readable shape. **Raw OpenAPI is YAML, intentionally** — that's how the source-of-truth and the docs site render it. Agents that specifically want OpenAPI as JSON can pipe through `yq -o=json`; we don't ship that as a first-class mode because the use case is rare and the consolidation removes the `--openapi --json` awkwardness.

---

## 5. Architecture

### 5.1 Spec source

Single source: `https://www.sanity.io/docs/api/openapi` (index) and `https://www.sanity.io/docs/api/openapi/<slug>?format=yaml|json` (per-spec). Owned by the docs team. Anonymous; no auth required for discovery commands.

**Required contract extension (cross-team dependency, must land before Phase 1 ships):** the index response must carry a per-spec `revision` field so the CLI can revalidate cheaply without going around the docs endpoint.

Current shape:

```json
{"specs": [{"slug": "jobs", "title": "Jobs API reference", "description": "…"}]}
```

Required shape:

```json
{
  "specs": [
    {
      "slug": "jobs",
      "title": "Jobs API reference",
      "description": "…",
      "revision": "4JnW9YJcXzgCtOR0AWgFHp"
    }
  ]
}
```

The change lives in **`sanity-io/www-sanity-io`** — the main `sanity.io` monorepo. Specifically `apps/docs/`:

- `src/app/api/openapi/route.ts` — the index endpoint handler
- `src/app/api/openapi/[slug]/route.ts` — the per-spec handler (supports `?format=yaml|json`)
- `src/sanity/queries/openApiQueries.ts` — the GROQ queries
- `src/sanity/openApiService.ts` — the service layer + YAML/JSON conversion

_(An earlier draft of this spec named `sanity-io/sanity-internal-api-reference`. That repo is unrelated — it powers `openapi.sanity.build`, an internal preview behind Vercel SSO, using a different schema (`apiSpecification`, plain-string slug) and a different dataset. It is **not** the source for `sanity.io/docs/api/openapi`.)_

The change itself is trivial — projection-only — and **already landed locally** on branch `feat/openapi-index-revision-field` (commit `f5190eb9e`):

1. `openApiQueries.ts`: add `"revision": _rev` to the index projection.
2. `openApiService.ts`: add `revision: string` to the `OpenApiSpec` interface and the returned `.map(...)` object.
3. Run `pnpm typegen:generate` from `apps/docs/` to refresh `sanity.types.ts`.
4. Update tests to assert the new field.

Each `openApiReference` document already has Sanity's `_rev` system field. The docs API just projects it as `revision` on the response — the public name drops the underscore-prefix so the docs-team contract doesn't leak the Sanity-internal convention.

**Other index-endpoint details verified while making the change** (worth knowing for Phase 1 implementation):

- **Parent vs child specs.** The GROQ filter is `*[_type == "openApiReference" && schemaLevel != "child"]` — only `schemaLevel: "parent"` specs are returned. The `openApiReference` schema has a `schemaLevel` field with values `"parent"` or `"child"` (defined in `packages/sanity-config/src/schemas/docs/documents/openApiReference.ts`). **Child specs are merge fragments** — small OpenAPI definitions that get composed into a parent spec via the `childSchemas` reference array. They never render their own docs page, and the CLI should never see them. The 23-spec count we audited reflects parent specs only.
- Ordering is `order(title asc)`, not slug-alphabetical. Stable output but sorted by title.
- The endpoint sets `Cache-Control: s-maxage=1800, stale-while-revalidate` — a 30-minute CDN cache. **Implication for the revision mechanism:** spec changes are visible to the CLI within ~30 minutes (CDN edge TTL) at worst, instant if the edge is cold. The revalidation primitive is correct; the ceiling on freshness comes from the upstream CDN, not the CLI cache.

**Development source (preview deployments).** While the docs PR is still in preview (PR [#3740](https://github.com/sanity-io/www-sanity-io/pull/3740)), the CLI's base URL points at the per-branch Vercel preview, not production:

```
DEV  base URL:  https://sanity-docs-git-feat-openapi-index-revision-field.sanity.build
PROD base URL:  https://www.sanity.io/docs                                  (post-merge)
```

The preview URL is stable for the lifetime of the branch (Vercel's `git-<branch>` pattern). It serves the same `/api/openapi` and `/api/openapi/<slug>` routes the production URL will once merged. **One catch:** Vercel preview deployments are gated by **Vercel SSO** — anonymous `curl` returns 401 and an SSO redirect. Three workarounds (mutually exclusive, pick one):

1. `vercel curl <url>` — Vercel CLI authenticates transparently. Works if `vercel login` was run.
2. **Vercel Protection-Bypass token** (preferred for CLI dev): a project-level token that bypasses SSO via a query string. Add `?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=$TOKEN` to set a cookie, then anonymous requests on the same browser/CLI session work. Docs: [`vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation`](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation). The CLI's `fetchSpecIndex.ts` should read the token from `SANITY_DOCS_API_BYPASS_TOKEN` env var and append it when set.
3. Wait for merge. Once the docs PR merges to `main`, `www.sanity.io/docs/api/openapi` will serve the new `revision` field anonymously; the preview is no longer needed.

**Phase 1 should make the base URL configurable** — a single env var (`SANITY_DOCS_API_URL`, default `https://www.sanity.io/docs`) plus the bypass-token env above is enough. No flag needed; this is dev-only plumbing.

**Why not GROQ direct against `3do82whm/next`:** the docs endpoint is the stable, owned contract. The Sanity dataset schema may change (field renames, restructuring) without warning; the docs endpoint won't. Extending the docs endpoint with `revision` keeps the CLI on one contract instead of two.

### 5.2 Cache layout and revision-based invalidation

```
~/.config/sanity[-staging]/cache/api/
  revisions.json        # {slug → revision} — source of truth for "is X stale?"
  specs/<slug>.yaml     # raw OpenAPI YAML, written on fetch
```

**Test-time override:** `SANITY_CLI_CACHE_PATH` env var redirects the root. Tests use a per-`describe` `mkdtemp` directory so they never touch the developer's real cache. Production callers leave it unset.

The v1 cache is intentionally minimal — two file shapes. Earlier drafts called for `specs/<slug>.json` (parsed form), `operations.json` (flattened index), and `meta.json` (TTL fallback). All three are deferred — Phase 1 parses YAML on demand and never persists derived data. `meta.json` comes back when Phase 3 (`sanity api refresh`) introduces TTL fallback semantics.

**Invalidation strategy: revision-keyed, not TTL.** Any command that reads the cache performs a revalidation step before serving content:

1. Fetch the index from `https://www.sanity.io/docs/api/openapi`. Anonymous, ~30–60 ms, small payload. Each entry carries `revision` (per Section 5.1).
2. For each entry, decide whether to refetch the spec body. The check is in `src/api/revalidate.ts:shouldRefetch`:
   - **No cached YAML on disk** → refetch.
   - **Upstream revision is `''`** (pre-merge fallback — the docs PR adding `revision` hasn't deployed yet) → refetch.
   - **Cached revision differs from upstream** → refetch.
   - **Otherwise** → serve cache (no network call for this spec).
3. Refetched specs get written to `specs/<slug>.yaml`; `revisions.json` is updated with the new revisions.

Consequences:

- **Post-merge (docs revision field deployed)** — warm cache = one small network call (the index) per command, zero per-spec fetches. A producer-repo deploy invalidates only the specs that actually changed.
- **Pre-merge fallback** — `revision: ''` from upstream means the CLI can't tell what changed, so it conservatively refetches every spec on every invocation. Slower but correct. The earlier "trust cache forever when revision missing" behavior was a bug — the CLI would have happily served stale specs for weeks.
- Only one contract to talk to. The CLI never reaches around the docs endpoint into the underlying Sanity dataset.
- TTL fallback (for index-endpoint outages) is deferred to Phase 3.

### 5.3 Command structure

```
# Canonical (under `sanity api`):
sanity api list                          # Phase 1 — flat operation table
sanity api spec <slug>                   # Phase 1 — flag-driven output (default human, --format=json, --format=openapi)
sanity api <endpoint>                    # Phase 2 — execute request (GET by default; -X for other methods)
sanity api refresh                       # Phase 3 — cache UX

# Deprecated for one minor (forwarders that emit a stderr warning + delegate):
sanity openapi list                      # → `sanity api list`
sanity openapi get <slug>                # → `sanity api spec <slug>` (+ flag translation: --format=yaml → --format=openapi, --format=json passes through unchanged)
```

The `describe` command is dropped: with `list` showing every operation (method + endpoint), the agent's discovery loop becomes `list → pick endpoint → call`. There's no intermediate "describe" step to wedge in.

Operation-id mode (`sanity api <spec>.<opId>`) is dropped from the v1 plan for the same reason: the rendered endpoint string is already the addressable form. Revisit only if usage shows agents preferring named ops to URL paths.

### 5.4 Files added

```
packages/@sanity/cli/src/commands/api/                 # Canonical — minimal command shells
  list.ts                       # `sanity api list` — Phase 1
  spec.ts                       # `sanity api spec <slug>` — Phase 1
  call.ts                       # `sanity api <endpoint>` — Phase 2
  refresh.ts                    # Phase 3
  __tests__/
    list.test.ts
    spec.test.ts
    ...

packages/@sanity/cli/src/commands/openapi/             # Deprecated forwarders (one minor cycle, then deleted)
  list.ts                       # prints deprecation warning, delegates to commands/api/list.ts
  get.ts                        # prints deprecation warning, translates --format → new flags, delegates to commands/api/spec.ts

packages/@sanity/cli/src/api/                          # Shared internals (no command code here)
  cache.ts                      # revision-keyed local cache (Phase 1)
  capability.ts                 # method-based capability heuristic (Phase 1)
  fetchSpecIndex.ts             # docs endpoint /openapi → index (includes revision per spec)
  fetchSpec.ts                  # docs endpoint /openapi/<slug> → YAML
  parseOpenApi.ts               # OpenAPI YAML → ParsedSpec / ParsedOperation
  operationsIndex.ts            # flatten parsed specs → sorted operations list
  loadParsedSpecs.ts            # read every cached YAML and parse it (Phase 1)
  operationsListView.ts         # table renderer + JSON projection for `list` (Phase 1)
  specView.ts                   # human renderer + JSON projection for `spec` (Phase 1)
  revalidate.ts                 # orchestrates the revision-keyed revalidation flow
  resolveEndpoint.ts            # map `<api-version>/<path>` → spec metadata (Phase 2)
  types.ts                      # shared types (OpenApiSpecIndexEntry)
  __tests__/
    capability.test.ts
    parseOpenApi.test.ts
```

**oclif auto-discovers commands from the directory** — no `index.ts` registration needed. The only build-time step is `packages/@sanity/cli/scripts/check-topic-aliases.ts`, where every new top-level directory under `commands/` (here, `api/`) must be listed in `knownTopicsWithoutAliases` or in `topicAliases`. Phase 1 adds `'api'` to the former.

**Command files are intentionally thin.** Each is ~75–135 lines: flag schema, the `run()` flow control, and at most a couple of `private` helpers that delegate to `src/api/*` view modules. **No rendering, parsing, or cache logic in the command file.** Adding the call command (`commands/api/call.ts`, Phase 2) follows the same template — see `list.ts` for the shape.

**Migration mechanic:** the deprecation forwarders in `commands/openapi/{list,get}.ts` print one stderr line (`warning: sanity openapi <verb> is deprecated, use sanity api <verb> instead. Removed in the next major.`), translate any legacy flags (`--format=yaml` → `--format=openapi`; `--format=json` passes through unchanged — same value, same meaning), then delegate via `ApiListCommand.run(argv, this.config)` to the canonical implementation. Behavior is otherwise identical. Removed at the next major version.

---

## 6. Phases

Each phase is one PR. Within a phase, every flag is questioned individually against gh/vercel conventions. When in doubt, the flag becomes its own phase.

---

### Phase 1 — `sanity api list` + `sanity api spec` (canonical) + `openapi` deprecation forwarders + shared revision cache

**Goal:** Land the agent's two discovery commands as canonical `sanity api list` and `sanity api spec <slug>`. Deprecate the existing `sanity openapi list` / `sanity openapi get` by converting them into thin forwarders that emit a stderr warning and delegate to the canonical implementations.

- `sanity api list` — one row per operation across all specs. Answers _"which endpoint do I call?"_
- `sanity api spec <slug>` — single spec, flag-driven output. Answers _"what params does this endpoint take?"_ by default; can also return raw OpenAPI for users who want the underlying spec.

Both commands sit on the same parsed-ops index, the same revision-keyed cache, and the same OpenAPI parser. The `openapi` forwarders share the same module — never any drift.

**Prerequisite (blocker):** the docs endpoint `revision` contract extension (Section 5.1) is shipped. Without it, the cache falls back to TTL-only and the spec's selling points (revision-keyed invalidation, second-call zero-fetch) don't hold. Open this PR only after the docs-team change is in production.

**PR scope (one PR):**

1. Extract inline fetch logic from existing `commands/openapi/{list,get}.ts` into `packages/@sanity/cli/src/openapi/{fetchSpecIndex,fetchSpec,cache}.ts`. **Base URL is env-configurable** (`SANITY_DOCS_API_URL`, default `https://www.sanity.io/docs`) so the dev loop can point at the Vercel preview branch (Section 5.1) until the docs PR merges. Bypass token via `SANITY_DOCS_API_BYPASS_TOKEN` when set.
2. Add `parseOpenApi.ts`, `operationsIndex.ts`, `capability.ts` — parse each spec into a list of operations (with full param metadata, including `requiredQueryParams` and `enum` values for body fields), flatten across specs into one index, cache parsed output alongside YAML.
3. Land the revision-keyed cache once.
4. **Add canonical commands** `commands/api/list.ts` and `commands/api/spec.ts` with the new behaviors (operation-row table for `list`; flag-driven three-mode output for `spec` — default human, `--format=json`, `--format=openapi`).
5. **Convert `commands/openapi/{list,get}.ts` into deprecation forwarders.** Each invocation:
   - Emits a one-line stderr warning: `"warning: sanity openapi <verb> is deprecated, use sanity api <verb> instead. Will be removed in the next major."`
   - Translates legacy `--format=yaml` → `--format=openapi` and emits the deprecation warning. `--format=json` already matches the new flag value and passes through.
   - Delegates to the canonical `commands/api/{list,spec}.ts` implementation.
   - Returns the canonical command's exit code unchanged.
6. Release notes call out: (a) the `openapi` deprecation timeline, (b) the `openapi list --json` payload shape change (per-operation rows, not per-spec), (c) the `openapi get` default-output change (structured view; pass `--format=openapi` to get the prior raw-YAML behavior).

**Endpoint string format (the contract Phase 2 will consume):**

`<api-version>/<path>`, where:

- `<api-version>` comes from the spec's `info.version` (e.g. `v2021-06-07`) — already date-pinned, already the form Sanity URLs use.
- `<path>` is the OpenAPI `paths` key, with **placeholders rendered in URL Pattern API syntax** (`:jobId`, `:dataset`, `:projectId`). The CLI parses OpenAPI's native `{name}` and emits `:name` consistently in every user-facing surface (list, spec, errors, examples). Rationale: URL Pattern API is the W3C standard, matches Express/Next.js route conventions, and avoids bash brace-expansion edge cases.
- The `<endpoint>` argument to `sanity api <endpoint>` (Phase 2) accepts **both** `:name` (preferred — what `list` renders) and `{name}` (compatibility for users copy-pasting from the docs site, which still shows OpenAPI's `{name}`). Treated identically internally.
- Host is resolved at call time by Phase 2 from the spec's `servers` block — agents never have to think about whether an endpoint goes to `api.sanity.io` or `<projectId>.api.sanity.io`.

Example: `v2021-06-07/jobs/:jobId` (jobs spec), `v2024-08-01/agent/action/translate/:dataset` (agent-actions).

**New `list` human output (default):**

```
METHOD  ENDPOINT                                              SPEC               DESCRIPTION
GET     v2024-04-01/access/projects/:projectId/users          access-api         List users in a project
POST    v2024-04-01/access/projects/:projectId/users          access-api         Invite a user [write]
…
POST    v2024-08-01/agent/action/translate/:dataset           agent-actions      Translate a document [write]
POST    v2024-08-01/agent/action/generate/:dataset            agent-actions      Generate content [write]
…
GET     v2021-06-07/jobs/:jobId                               jobs               Get the status of a job
GET     v2021-06-07/jobs/:jobId/listen                        jobs               Listen for job updates [stream]
DELETE  v2024-01-01/projects/:projectId                       projects-api       Delete a project [destructive]
…
```

- **Sorted by spec then by path then by method.** Stable ordering matters for diffability and agent re-runs.
- **`[write]` / `[destructive]` / `[stream]` tags** appear at the end of the description when applicable. Capability is **method-based, no path inspection**: `GET`/`HEAD`/`OPTIONS` → unmarked (read); `PATCH`/`PUT`/`DELETE` → `destructive`; `POST` → `write`; SSE-returning responses → `stream`. Method-only keeps the rule auditable (no surprise classifications from path-name false positives) and aligns with how the Phase 2 guard reads the same field.
- **No truncation of method, endpoint, or spec columns** — those are copy-targets. Description ellipsizes to fit remaining terminal width.

**New `list --json` output:**

```json
[
  {
    "method": "GET",
    "endpoint": "v2021-06-07/jobs/:jobId",
    "spec": "jobs",
    "operationId": "jobStatus",
    "summary": "Get the status of a job",
    "pathParams": ["jobId"],
    "requiredQueryParams": [],
    "capability": "read",
    "isStreaming": false,
    "docsUrl": "https://www.sanity.io/docs/http-reference/jobs"
  }
]
```

`pathParams` are by definition required (they're in the URL); `requiredQueryParams` lists the query keys whose `required: true` flag is set in the spec — **regardless of HTTP method**. The audit of all 22 public specs found 10 such operations across 5 specs, including the highest-volume endpoints (`query.queryDataset` needs `?query=…`, `listen` needs `?query=…`) and several POSTs with required query params (`scheduling.publishDocuments` needs `?documentIds=…`, `media-library.uploadAsset` needs `?type=…&filename=…`). Without this field surfaced, every first call to one of these endpoints would silently fail server-side with a 4xx. Together with `pathParams`, it tells an agent the minimum it needs to assemble before calling — no follow-up `spec` fetch required. Optional query params still need a `spec` lookup — that's the trade-off keeping `list --json` light.

Top-level array, one entry per operation. **This is a breaking change** to the existing `openapi list --json` shape (which today returns 23 spec rows). Worth doing because:

1. The new shape is what agents actually need (an operation is the addressable thing).
2. `openapi list --json` shipped April 2026 — small consumer surface, easy to call out in release notes.
3. The old per-spec view is still available via `sanity openapi list --json | jq 'group_by(.spec) | map({spec: .[0].spec, count: length})'` or by reading the spec list endpoint directly.

**Spec output (`sanity openapi get <slug>` ≡ `sanity api spec <slug>`):**

One canonical command, three output modes driven by a single `--format` flag:

| Invocation         | Output                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| _(no flag)_        | Structured per-operation human view (default).                                            |
| `--format=json`    | Structured per-operation JSON (agent-friendly).                                           |
| `--format=openapi` | Raw OpenAPI spec, YAML — the source-of-truth shape (the default of the `openapi` family). |

Adding `--operation <id>` narrows any of the three to a single operation. **Raw OpenAPI as JSON is intentionally not a first-class mode** — the OpenAPI ecosystem and Sanity's docs site both render YAML; the rare consumer that needs JSON can pipe through `yq -o=json` (or `python -c 'import yaml,json,sys;print(json.dumps(yaml.safe_load(sys.stdin)))'`). This removes the awkward `--openapi --json` two-flag combination from the earlier draft.

**Default (human-readable structured view):**

```
Jobs API — v2021-06-07
Monitor and manage processes running inside Sanity's infrastructure.
Docs: https://www.sanity.io/docs/http-reference/jobs

──────────────────────────────────────────────────────────────────────
GET  v2021-06-07/jobs/:jobId  ·  jobStatus  ·  read
Get the status of a job.

  Path params:
    jobId   string  required   The job identifier returned from a job-creation operation.

  Query params:
    (none)

  Auth:    Bearer token (JWT)

──────────────────────────────────────────────────────────────────────
GET  v2021-06-07/jobs/:jobId/listen  ·  jobListen  ·  read · stream
Each job has a `/listen` endpoint to allow you to monitor its status programmatically.

  Path params:
    jobId   string  required   The job identifier returned from a job-creation operation.

  Query params:
    (none)

  Response: text/event-stream (use `sanity api … --stream`, Phase 8)
  Auth:     Bearer token (JWT)
```

JSON output (`--json`):

```json
{
  "spec": "jobs",
  "title": "Jobs API",
  "version": "v2021-06-07",
  "description": "Monitor and manage processes running inside Sanity's infrastructure.",
  "docsUrl": "https://www.sanity.io/docs/http-reference/jobs",
  "operations": [
    {
      "operationId": "jobStatus",
      "method": "GET",
      "endpoint": "v2021-06-07/jobs/:jobId",
      "summary": "Get the status of a job",
      "description": "Get the status of a job.",
      "capability": "read",
      "isStreaming": false,
      "pathParams": [
        {
          "name": "jobId",
          "in": "path",
          "type": "string",
          "required": true,
          "description": "The job identifier returned from a job-creation operation."
        }
      ],
      "queryParams": [],
      "headerParams": [],
      "requestBody": null,
      "responses": [
        {
          "status": 200,
          "contentType": "application/json",
          "schemaSummary": "{ id, state, authors, createdAt, updatedAt }"
        }
      ],
      "security": [{"scheme": "BearerAuth"}]
    }
  ]
}
```

Notes on the shape:

- One JSON object per spec; operations is an array (no nested paths/methods/responses dance — pre-flattened).
- All params (`pathParams`, `queryParams`, `headerParams`) carry `name`, `in`, `type`, `required`, `description`, plus `default`, `example`, and **`enum: [...]`** when the spec provides them. Surfacing enum is non-negotiable — without it, agents have to do a second API call to discover valid values (e.g. `roleName` on `createToken`, `state` filters on schedules). See body-schema note below.
- `requestBody` (when present) is **structured**, not a one-line summary: `{ contentType, required: bool, fields: [{ name, type, required, description, enum?, default? }] }`. Body field enums are first-class — `roleName: ["administrator", "editor", "viewer", "contributor"]` ships in the JSON without a follow-up fetch. For deeply nested body shapes, fields can be objects themselves (recursive `fields` array); we cap recursion at 3 levels and emit `"…"` for deeper structures to keep payload size reasonable.
- Capability and streaming flags match `list --json` exactly — agents can reason consistently.
- No `$ref` resolution required on the consumer side; we resolve refs during parse.

Optional `--operation <id>` flag narrows to a single operation (returns the same JSON shape with `operations` filtered to one entry). Trivial filter, big agent QoL.

**Flags considered (`list`):**

| Flag            | From                       | Verdict           | Reason                                                                                                                                                |
| --------------- | -------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json`        | existing on `openapi list` | **Keep**          | Required for agents. Payload shape now one-row-per-operation.                                                                                         |
| `--web` / `-w`  | existing                   | **Keep**          | Opens `sanity.io/docs/http-reference[/<slug>]` in browser.                                                                                            |
| `--spec <slug>` | own                        | **Keep**          | Narrow `list` to one spec. Trivial filter; common ask.                                                                                                |
| `--no-cache`    | own                        | **Drop entirely** | Cache revalidation is automatic via `revision`; no bypass flag needed. If the cache is wrong, `sanity api refresh` (Phase 3) is the explicit way out. |
| `--limit <n>`   | own                        | **Drop**          | ~150–400 operations — fits in one screen with `--spec`. Revisit if surface grows materially.                                                          |

**Flags considered (`spec` / `openapi get`):**

| Flag                       | From                      | Verdict                          | Reason                                                                                                                                                  |
| -------------------------- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format <json\|openapi>` | own                       | **Keep**                         | Picks the machine-readable output mode. Default (no flag) renders the human view. `openapi` = raw OpenAPI YAML; `json` = structured per-operation JSON. |
| `--operation <id>`         | own                       | **Keep**                         | Narrow to one operation by `operationId`. Works in all three output modes.                                                                              |
| `--web` / `-w`             | existing                  | **Keep**                         | Opens `sanity.io/docs/http-reference/<slug>` in browser.                                                                                                |
| `--json` (boolean)         | own                       | **Drop entirely**                | Folded into `--format=json`. Two orthogonal flags (`--json` + `--openapi`) was awkward; one `--format` value is clearer.                                |
| `--openapi` (boolean)      | own                       | **Drop entirely**                | Folded into `--format=openapi`.                                                                                                                         |
| Legacy `--format yaml`     | existing on `openapi get` | **Deprecated alias (one cycle)** | Translates to `--format=openapi` with a stderr warning. Removed after.                                                                                  |
| Legacy `--format json`     | existing on `openapi get` | **Same flag, same value**        | `--format=json` is now the canonical name. No translation needed; the legacy invocation works as-is on the new command.                                 |

**Files touched:**

- Add: `packages/@sanity/cli/src/openapi/{fetchSpecIndex,fetchSpec,cache,parseOpenApi,operationsIndex,capability}.ts` + tests.
- Add: `packages/@sanity/cli/src/commands/api/{index,list,spec}.ts` + tests — canonical implementations of `sanity api list` (operation-row table; `--json` payload of operations) and `sanity api spec <slug>` (default human view; `--format=json` structured per-op JSON; `--format=openapi` raw YAML; `--operation <id>` narrowing).
- Modify: `commands/openapi/list.ts` — convert to a deprecation forwarder; print stderr warning naming `sanity api list`; delegate to canonical implementation.
- Modify: `commands/openapi/get.ts` — convert to a deprecation forwarder; print stderr warning naming `sanity api spec`; translate legacy `--format=yaml` → `--format=openapi` (pass `--format=json` through unchanged); delegate to canonical implementation.
- Delete: nothing.

**Tests:**

- **Alias resolution (both):** `sanity api list` ≡ `sanity openapi list` (modulo deprecation warning on stderr) and `sanity api spec <slug>` ≡ `sanity openapi get <slug>` produce byte-identical stdout/exit-code under every flag combination. Stderr asserts: canonical commands emit nothing; deprecated forwarders emit exactly one warning line.
- **Output mode matrix (`spec` / `openapi get`):** assert all three combinations against fixtures:
  - _(no flag)_ → structured human render; snapshot.
  - `--format=json` → structured JSON; assert top-level object with `operations` array, full param shape (including `enum` on body fields).
  - `--format=openapi` → raw OpenAPI YAML; byte-identical to the upstream YAML (passthrough).
- **`--operation <id>` narrowing** works in all three output modes.
- **Invalid `--format` value** (e.g., `--format=yaml` on the canonical command, or `--format=xml`): clean error before sending; lists valid values `json|openapi`.
- **Legacy `--format` translation on the forwarder:** `sanity openapi get <slug> --format=yaml` → emits deprecation warning AND translates to `--format=openapi`; `--format=json` emits deprecation warning but passes the value through unchanged.
- **Operation enumeration:** fixtures with 3 small specs covering plain paths, path placeholders, multiple methods on one path, and an SSE response. Assert the flattened index matches expected operation counts and shapes.
- **Endpoint string format:** assert `v<date>/<path>` rendering with `:name` placeholders (URL Pattern API style).
- **Capability tagging (method-based):** GET/HEAD/OPTIONS → untagged (read); PATCH/PUT/DELETE → destructive; POST → write; SSE response → stream.
- **Table output (`list`):** snapshot at 80, 120, and 200 column widths. Method/endpoint/spec columns never truncate; description ellipsizes.
- **JSON shape (`list --json`):** assert all fields present; assert top-level array of operations.
- **Cache behavior:**
  - First call hits the index endpoint, writes `revisions.json` + YAML + parsed-ops cache.
  - Second call with unchanged `revision`: only the index endpoint is hit (no per-spec fetch, no re-parse — assert via `mockApi` call counts and timing).
  - Second call with changed `revision` for one slug: refetches and re-parses only that slug.
- Existing `openapi/*` tests update to assert the deprecation warning on stderr and the delegated behavior. Release notes call out the namespace deprecation, the `list --json` shape change, and the `get` default-output change.

**Acceptance:**

- `sanity api list` ≡ `sanity openapi list` byte-identical stdout at any terminal width (modulo a single deprecation warning on stderr from the openapi form).
- `sanity api spec <slug>` ≡ `sanity openapi get <slug>` byte-identical stdout in all three output modes (same modulo).
- Default `sanity api spec <slug>` (no flag) renders the structured human view — the answer to "what params does this endpoint take?".
- `sanity api spec <slug> --format=json --operation <id>` returns a single-operation JSON object with full params + descriptions (incl. enum values) — agents extract everything needed for a call in one fetch.
- `sanity api spec <slug> --format=openapi` returns the same bytes that `sanity openapi get <slug>` used to return by default (no information loss for users who reach for the raw spec).
- All 23 live specs parse without error; total flattened operation count is logged.
- Cache revalidation < 50 ms warm; < 1 s cold.
- The endpoint string produced for every operation is verbatim what Phase 2 will accept as input.

**Implementation notes (Phase 1, as built):**

- **Shared internals live at `src/api/`, not `src/api/lib/` or `src/openapi/`.** Co-located under one namespace makes the import paths clean (`from '../../api/...'`) and matches the canonical command name. Command files never own rendering, parsing, or cache logic — those are imported from `src/api/`.
- **Two JSON projections, intentionally different.** `operationsListView.toOperationJsonRow` (for `list --json`) includes `spec` and `docsUrl` per row — the row stands alone. `specView.buildSpecJsonView` (for `spec --format=json`) wraps operations under a single `{ spec, title, version, docsUrl, operations: [...] }` envelope, and each operation drops `spec`/`docsUrl` since they'd be redundant. Don't unify the two — each fits its consumer.
- **`SANITY_CLI_CACHE_PATH` env var is the test-time cache override.** Tests `mkdtemp` per `describe`, set the env var in `beforeEach`, delete it in `afterEach`. Real users leave it unset.
- **Topic registration via `check-topic-aliases.ts`.** Every new top-level directory under `commands/` must be listed somewhere — either in `topicAliases` (with aliases) or `knownTopicsWithoutAliases` (without). Phase 1 adds `'api'` to the latter. Missing this trips the `postbuild` step, not anything earlier — easy to discover but worth flagging.
- **Pre-merge fallback was a near-miss bug.** The first cut of `shouldRefetch()` checked `entry.revision !== '' && cachedRevision !== entry.revision` — which silently became "trust cache forever" whenever upstream's revision was missing. The corrected behavior treats `revision === ''` as "can't trust cache, refetch every call" (see Section 5.2). The fix matters in the window between Phase 1 PR landing and the docs-side `revision` extension deploying. Tests now cover both states.
- **Forwarder delegation pattern:** `await ApiListCommand.run(argv, this.config)` from inside the deprecated forwarder. Passing `this.config` carries the oclif config through so help text, telemetry, and other framework wiring stays consistent. Returning the canonical command's exit code is automatic — the static `run()` propagates errors.
- **Phase 2 hook-in points already wired:**
  - `revalidateSpecs()` exposes `{index, updated}` — Phase 2's `<endpoint>` lookup uses the same index to resolve `<api-version>/<path>` → spec.
  - `parseOpenApi` already extracts `serverTemplate` (with `{apiVersion}` substituted) — Phase 2's host resolution reads it.
  - Operation entries already carry `capability` — Phase 2's destructive guard reads it.
  - Nothing in Phase 1 needs to change for Phase 2 to land cleanly.

---

### Phase 2 — `sanity api <endpoint>` — execute requests

**Goal:** Make every operation rendered by Phase 1 directly callable. The endpoint string from `list` is the same string the user passes here — no transformation. Method defaults to GET; `-X` overrides. Auth defaults to the logged-in user's stored token; `--token` overrides for one-off calls. Host routing is automatic: the CLI matches the endpoint path against the operations index (built in Phase 1) to identify the owning spec, then resolves the server template using context plus optional `--project` / `--dataset` overrides.

**Commands:**

```
sanity api v2021-06-07/jobs/abc123                              # GET (default); :jobId substituted by user
sanity api -X DELETE v2024-01-01/projects/abc123                # explicit DELETE
sanity api v2024-01-01/data/query/production?query=*[0]         # query params inline (URL-encoded by user)
sanity api v2024-01-01/data/query/production -q 'query=*[0]'    # query params via flag (CLI URL-encodes)
sanity api v2024-01-01/webhooks/messages -q limit=10 -q offset=0
sanity api --project=xyz789 v2024-01-01/data/query/production -q 'query=*[0]'
sanity api --token=$STAGING_TOKEN v2024-04-01/access/me         # one-off auth override
```

**Behavior:**

- **Endpoint argument:** `<api-version>/<path>` — verbatim what `sanity api list` rendered. Leading `/` is accepted for forgiveness and stripped.
- **Spec match:** the CLI matches the path against the operations index (which is keyed on the OpenAPI `{name}` form internally, but the user's argument may use `:name` or `{name}` interchangeably). From the matched operation it derives the host template, the auth requirement, and whether the response is SSE.
- **Placeholder syntax (input):** accept both `:projectId` (CLI-rendered, URL Pattern API style — what `list` displays) and `{projectId}` (OpenAPI native — what the docs site shows). Both forms normalize to the same operation match. Error messages and rendered output always use `:name`.
- **Placeholder resolution (`:projectId` and `:dataset` in either the host or the path):** `--project` / `--dataset` flag → env (`SANITY_PROJECT_ID`, `SANITY_DATASET`) → `sanity.cli.ts` in cwd → logged-in user's default project. Same precedence chain whether the placeholder appears in the host or in the path (`/projects/:projectId/hooks`). This covers the common case in `projects-api`, `access-api`, `webhooks`, `user-attributes`, and `roles`. Other path placeholders (e.g. `:jobId`, `:hookId`) the user substitutes literally in the endpoint string — they're operation-specific and have no global default.
- **Request tagging** for the brief's MCP-fallback signal: every outbound request from `sanity api` carries `?tag=sanity.cli.api` (a query parameter the Sanity backend logs alongside the User-Agent set by `cli-core`'s shared `createRequester`). One coarse tag; per-operation granularity comes from the request path that's already in the server-side logs. The MCP team filters on `tag=sanity.cli.api*` and groups by URL to see which endpoints agents are falling back to.
- **Query parameters** — two equivalent ways to provide them; the CLI accepts both and merges them, with `-q` winning on key conflict:
  1. **Inline** in the endpoint string: `…?query=*[0]&limit=10` — exactly the URL form. User is responsible for URL-encoding. Works for humans pasting URLs from `spec`-derived examples.
  2. **`-q, --query key=value`** (repeatable) — CLI URL-encodes the value; preferred for agents and for values containing shell-hostile characters (`&`, `?`, `*`, spaces, GROQ queries). Repeating the same key sends `?key=v1&key=v2` as the server expects for array params.
     Use `sanity api spec <slug> --json` to discover which query params an operation accepts, their types, and whether they're required.
- **Pre-flight required-param validation (fail fast, tight feedback loop):** before sending, the CLI validates that every required input declared by the matched operation is supplied — _unfilled path placeholders_ (a token still in `:jobId` or `{jobId}` form that the user forgot to substitute), and the **`requiredQueryParams` list from Phase 1's operations index** (e.g. `query` on `query.queryDataset`, `documentIds` on `scheduling.publishDocuments`, `filename`/`type` on `media-library.uploadAsset`). Missing any required value → error before sending; exit non-zero; message names the missing params (always in `:name` form) and the flag to fix it (`-q name=…` for query, substitute inline for path). The check applies regardless of HTTP method — required query params exist on POSTs too, per the spec audit. This saves the 4xx-from-server round-trip that would otherwise be the agent's first feedback signal.
- **Auth:** stored token by default (existing CLI mechanism). `--token <value>` overrides for the single call. `401` from server surfaces a clean "run `sanity login` or pass `--token`" hint.
- **Output:** pretty-printed JSON by default (2-space indent), for terminal readability. `--json` returns the raw response body verbatim — same bytes the server sent, no parse/reformat — for piping and for non-JSON content types (SSE/binary fall through unchanged either way).
- **Body methods:** POST/PUT/PATCH with no `-f`/`-F`/`--input` error before sending: _"this method needs a request body — coming in Phase 4."_ GET/HEAD/DELETE/OPTIONS work fully.
- **Destructive-action guard (mandatory in P2 because DELETE lands here):**
  - **Method-based classification:** `PATCH` / `PUT` / `DELETE` are destructive. No path-name inspection — keeps the rule auditable and predictable.
  - **Reuses the existing CLI convention:** `--yes` (alias `-y`) is the per-command flag every other Sanity destructive command already uses (`tokens delete`, `media delete-aspect`, `deploy`, etc.). The `SanityCommand.isUnattended()` helper on `@sanity/cli-core` already combines the flag with a TTY check (`this.flags.yes || !this.resolveIsInteractive()`); we lean on it instead of reimplementing the logic.
  - **Non-interactive context** (no TTY — CI, agents, piped input), **no `--yes`** → CLI **refuses** to execute, exits non-zero with `"refusing to execute a destructive operation (PATCH/PUT/DELETE) in unattended mode. Pass --yes to confirm."`. This is the load-bearing line for "prevent damage agents could do" — an agent that copy-pastes a DELETE endpoint without thinking is stopped at the door. **Never prompts in this context** — prompts hang non-TTY callers.
  - **Interactive context** (TTY), **no `--yes`** → confirmation prompt: `"This will DELETE https://api.sanity.io/v2024-01-01/projects/abc123. Continue? [y/N]"`. `n` or empty input aborts (exit 0, no request sent); `y` proceeds.
  - **`--yes` in any context** → skip the prompt / pass the gate; proceed.
  - **`--dry-run` (Phase 5)** bypasses the guard entirely — nothing is sent, nothing to confirm.
  - Non-destructive operations are never gated, regardless of `--yes`.

**Flags considered:**

| Flag                    | From            | Verdict                | Reason                                                                                                                                                     |
| ----------------------- | --------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-X, --method <verb>`   | gh              | **Keep**               | User's explicit ask. Defaults to GET; overrides to any HTTP method.                                                                                        |
| `-q, --query key=value` | own             | **Keep**               | Repeatable URL query parameter; CLI URL-encodes the value. Agent-friendly alternative to inline `?…` in the endpoint.                                      |
| `--token <token>`       | Sanity-specific | **Keep**               | User's explicit ask. Overrides the stored auth token for the single call.                                                                                  |
| `--yes` (alias `-y`)    | sanity-cli      | **Keep**               | Existing per-command convention (e.g. `tokens delete --yes`). Pairs with `SanityCommand.isUnattended()`. Required in non-TTY contexts for destructive ops. |
| `--json`                | own             | **Keep**               | Pass through the raw response body. Default is pretty-printed JSON.                                                                                        |
| `--project <id>`        | Sanity-specific | **Keep**               | Resolves `:projectId` in both host (`<projectId>.api.sanity.io`) and path (`/projects/:projectId/…`).                                                      |
| `--dataset <name>`      | Sanity-specific | **Keep**               | Companion to `--project`; resolves `:dataset` placeholders in host or path.                                                                                |
| `-f, --field`           | gh              | **Drop (defer to P4)** | Body construction lands in its own phase.                                                                                                                  |
| `-F, --raw-field`       | gh              | **Drop (defer to P4)** | Typed JSON body field; restored alongside `-f` in P4.                                                                                                      |
| `-H, --header`          | gh              | **Drop (defer to P4)** | Headers ship alongside body construction.                                                                                                                  |
| `--input`               | gh              | **Drop (defer to P4)** | File or stdin body; mutually exclusive with `-f`/`-F`.                                                                                                     |
| `--dry-run`             | own             | **Drop (defer to P5)** | High-value but its own phase.                                                                                                                              |
| `--api-version`         | Sanity-specific | **Drop entirely**      | The api-version is part of the endpoint string itself; no separate flag needed.                                                                            |
| `--cdn`                 | Sanity-specific | **Drop (defer to P9)** | CDN routing belongs in its own phase; default to `api.sanity.io` for now.                                                                                  |

**Error UX (the contract that keeps the PR reviewable):**

```
$ sanity api -X POST v2024-08-01/agent/action/translate/production
error: POST needs a request body. Body construction (-f, -F, --input) ships in Phase 4.

$ sanity api v2024-01-01/data/query/production?query=*[0]
error: this endpoint runs on a project-scoped host but no project ID is set.
hint: pass --project=<id>, set SANITY_PROJECT_ID, or run from a directory with sanity.cli.ts

$ sanity api v9999-99-99/something/made/up
error: no spec found owning path "/something/made/up" at version v9999-99-99.
hint: run `sanity api list --spec=...` to see valid endpoints.

$ sanity api v2024-01-01/data/query/production --project=abc123
error: missing required query parameter(s): query
hint: pass with -q query='*[…]' (or inline ?query=…). See: sanity api spec query --json

$ sanity api v2024-08-01/jobs/:jobId
error: unfilled path placeholder(s): :jobId
hint: substitute the value directly in the endpoint string (e.g. v2024-08-01/jobs/jacsfsmnxp).

$ sanity api -X DELETE v2024-01-01/projects/abc123
This will DELETE https://api.sanity.io/v2024-01-01/projects/abc123. Continue? [y/N] █

$ echo "" | sanity api -X DELETE v2024-01-01/projects/abc123
error: refusing to execute a destructive operation (PATCH/PUT/DELETE) in unattended mode.
hint: pass --yes to confirm (e.g. `sanity api -X DELETE … --yes`).
```

**Files touched:**

- Add: `packages/@sanity/cli/src/commands/api/call.ts` + tests.
- Add: `packages/@sanity/cli/src/openapi/resolveEndpoint.ts` — given `<api-version>/<path>`, returns the matched operation, resolved host template, and auth requirement.
- Reuse: existing CLI auth/token plumbing for the default token; existing project/dataset resolution helpers.

**Tests:**

- GET against a non-project-scoped endpoint (jobs spec): mocked 200 JSON body emitted pretty-printed (2-space indent); same call with `--json` emits the server's raw bytes verbatim.
- GET against a project-scoped endpoint with `--project=abc`: outbound URL is `abc.api.sanity.io/...`.
- Non-JSON response (e.g. `Content-Type: text/plain`): pretty-print is a no-op — body passes through unchanged whether `--json` is set or not.
- `-X DELETE` on `/projects/:projectId`: correct method, correct host.
- **Path-placeholder resolution:** `sanity api v2024-01-01/projects/:projectId/hooks --project=xyz789` → outbound path is `/v2024-01-01/projects/xyz789/hooks`. Same behavior whether `:projectId` is in host or path. Missing project (no flag, no env, no cli config, no default) → clean error before sending, names `--project`.
- **Input syntax compatibility:** identical request for `…/projects/:projectId/hooks` and `…/projects/{projectId}/hooks` (both forms accepted; same operation match; same outbound URL).
- **Pre-flight validation:**
  - **Unfilled path placeholder:** `sanity api v2024-08-01/jobs/:jobId` (no `--project` involved) → error before sending, exit non-zero, lists `:jobId` and tells the user to substitute it inline. No request goes out. Same error from the `{jobId}` form.
  - **Missing required query param:** `sanity api v2024-01-01/data/query/production --project=abc123` (no `-q query=…`) → error before sending, lists `query` as missing, points at `-q` and `sanity api spec query --json`.
  - **Missing required query param on a POST:** `sanity api -X POST v…/schedules/:projectId/:dataset` with no `-q name=… -q executeAt=… -q action=…` → error before sending, lists all three. Confirms the validation is method-agnostic.
  - **All required filled** → request is sent; no validation overhead visible to the user.
- **Request tag:** every outbound URL carries `?tag=sanity.cli.api` (merged with user query params, never overrides a user-set `tag`).
- `--token=foo`: outbound `Authorization: Bearer foo`, regardless of stored token.
- **Query params:**
  - `-q query='*[_type=="foo"]'`: outbound URL contains `?query=%2A%5B_type%3D%22foo%22%5D` (URL-encoded by the CLI).
  - `-q limit=10 -q offset=20`: outbound URL contains both, order preserved.
  - Repeated key (`-q tag=a -q tag=b`): outbound URL is `?tag=a&tag=b` (server-side array semantics).
  - Inline `?a=1` + `-q a=2`: flag wins; outbound URL has `a=2` only.
  - Inline `?a=1` + `-q b=2`: merged; outbound URL has both.
- POST/PUT/PATCH with no body flags: clean error, exit non-zero, names Phase 4.
- Endpoint path not in operations index: error suggests closest match (uses the same flattened index as `list`).
- 401 from server: clean hint pointing at `sanity login` or `--token`.
- **Destructive guard** (mock `SanityCommand.resolveIsInteractive()` to drive the TTY branch):
  - Classification: assert PATCH, PUT, DELETE → destructive; POST → write (gated); GET/HEAD/OPTIONS → read (never gated).
  - Interactive + DELETE without `--yes`: prompt shown; `n` (or empty input) aborts exit 0, no request sent; `y` proceeds.
  - Unattended (`isUnattended()` returns true: TTY false **or** `--yes` set) + DELETE without `--yes`: refuses, exit non-zero, message names `--yes`. **No request goes out, no prompt rendered.**
  - DELETE with `--yes` (interactive or not): no prompt; request sent.
  - POST/PATCH with `-X` but no body flags (Phase 2 only): the Phase 4 deferral error fires _before_ the destructive guard so we don't mask the missing-body case.
  - GET/HEAD/OPTIONS: never prompts, never refuses, regardless of `--yes` or TTY state.
  - Destructive op with `--dry-run` (Phase 5 once shipped): guard bypassed — nothing is executed.

**Acceptance:**

- Every read-style operation listed by Phase 1 is callable in Phase 2 by copy-pasting the endpoint string.
- The endpoint argument is the only positional; everything else is a flag.
- No silent failures: any unsupported case names the phase that unlocks it.
- **No destructive op executes without either interactive `y` confirmation or an explicit `--yes`** — the agent damage-prevention requirement.

---

### Phase 3 — `sanity api refresh`

**Goal:** Manual cache bust + visibility into what's cached. Small focused PR between the execution baseline (P2) and body-construction (P4), so cache issues are debuggable as soon as agents start using `list` heavily.

**Commands:**

```
sanity api refresh                      # force revalidate + refetch all
sanity api refresh --status             # show cache stats without rebuilding
```

**Flags considered:**

| Flag            | From | Verdict               | Reason                                                |
| --------------- | ---- | --------------------- | ----------------------------------------------------- |
| `--status`      | own  | **Keep**              | Diagnosing "is my cache stale?" comes up immediately. |
| `--spec <slug>` | own  | **Drop (this phase)** | Per-spec refresh is YAGNI until we see a need.        |

**Tests:**

- After `refresh`, `meta.lastRevalidation` updates and `operations.json` is rebuilt.
- `--status` prints stats and exits 0 without fetching.

---

### Phase 4 — Body construction: `-f`, `-F`, `--input`

**Goal:** Make POST / PUT / PATCH usable. (`-X` is already in Phase 2.) Vercel-style two-mode body was the original plan, but the role-play in Section 11 showed it forces agents into write-temp-file-then-`--input` for any non-string field. We deviate from strict Vercel parity for two agent-ergonomics wins:

- **`-F, --raw-field key=value`** — gh-style typed body field; values parse as JSON (numbers, booleans, `null`, arrays, objects, `@file.json` to inline a file). Solves the "I need a number/bool/nested object inline" case without forcing a temp file.
- **`--input -`** (stdin) — agents pipe in-memory JSON without touching the filesystem.

Both deviations are documented in Section 7 with the trade-off explicitly noted.

**Behavior:**

- `-f a=1 -f b=hello` → body `{"a": "1", "b": "hello"}` with `Content-Type: application/json`. All values strings; the simple path stays simple.
- `-F count=5 -F enabled=true -F tags='["a","b"]'` → body `{"count": 5, "enabled": true, "tags": ["a","b"]}` — values parsed as JSON.
- `-F payload=@./body.json` → reads the file and inlines its parsed JSON value under `payload`.
- `--input ./body.json` → reads file, sends bytes verbatim as the request body.
- `--input -` → reads request body from stdin to EOF, sends verbatim.
- `-f`/`-F` and `--input` together → error before sending: _"choose one — `-f`/`-F` to assemble fields, `--input` for a complete body."_
- Any of `-f`/`-F`/`--input` set with no explicit `-X` → method auto-flips from GET to POST.

**Flags considered:**

| Flag                        | From        | Verdict  | Reason                                                                                                     |
| --------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `-f, --field key=value`     | gh + vercel | **Keep** | Repeatable string field; the simple common path.                                                           |
| `-F, --raw-field key=value` | gh          | **Keep** | Typed JSON field; agents need numbers/booleans/arrays inline. Restored after role-play feedback.           |
| `--input <path\|->`         | gh          | **Keep** | File body or stdin. Stdin is the agent-native path (no filesystem intermediary). Restored after role-play. |
| `-H, --header "K: V"`       | gh + vercel | **Keep** | Standard. Repeatable. Overrides `Content-Type`, etc.                                                       |

**Tests:**

- `-f a=1 -f b=hello` → POST body is `{"a":"1","b":"hello"}` (both strings).
- `-F count=5 -F enabled=true -F tags='["a","b"]' -F nested='{"k":1}'` → body is `{"count":5,"enabled":true,"tags":["a","b"],"nested":{"k":1}}` with the correct JSON types.
- `-F payload=@./fixtures/payload.json` → reads file, inlines parsed JSON value under `payload`.
- `-f` and `-F` with the same key → flag-order wins (last write); document precedence.
- `--input ./fixtures/mutate.json` → body is byte-for-byte the file contents.
- `--input -` (stdin) → reads stdin to EOF, sends as body; works with both `echo '{…}' | sanity api …` and process-substitution.
- `-f`/`-F` and `--input` together → clean error before sending; non-zero exit; suggests choosing one.
- `-f` / `-F` / `--input` with no `-X` → outbound method is POST.
- `-H "Content-Type: text/plain"` overrides the default JSON content type for `--input`.
- Headers merged with defaults; `Authorization` from stored token (or `--token`) is overridable by an explicit `-H Authorization: …`.

---

### Phase 5 — `--dry-run`

**Goal:** Print resolved request without sending. Critical for agents staging mutations.

**Flags considered:**

| Flag        | From | Verdict  | Reason                               |
| ----------- | ---- | -------- | ------------------------------------ |
| `--dry-run` | own  | **Keep** | High-value, low-cost, agent-aligned. |

**Output:**

```
POST https://abc123.api.sanity.io/v2026-04-27/data/mutate/production
  Authorization: Bearer sk_…
  Content-Type: application/json
  Body (1.2KB):
    {"mutations":[…]}
```

Exits 0 without sending. Body truncates past N bytes to avoid context blowup; `--verbose` (Phase 7) shows the whole body.

---

### Phase 6 — `--paginate`

**Goal:** Iterate paginated endpoints automatically and emit a single combined response. **Scope grounded in spec audit:** 8 of 22 public specs use pagination, in two distinct styles — no `Link: rel="next"` headers anywhere.

**Specs using pagination (audit, 2026-05-11):**

| Spec              | Style            | Termination signal                                                                                                                                                      |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access-api`      | Cursor           | `nextCursor` field; `null` when done                                                                                                                                    |
| `backups`         | Cursor           | `nextCursor` field; `null` when done                                                                                                                                    |
| `media-library`   | Cursor           | `nextCursor` field; `null` when done                                                                                                                                    |
| `user-attributes` | Cursor           | `nextCursor` + explicit `hasMore: false`                                                                                                                                |
| `projects-api`    | Offset / limit   | Response shorter than `limit` ⇒ done                                                                                                                                    |
| `scheduling`      | Offset / limit   | Same                                                                                                                                                                    |
| `webhooks`        | Offset / limit   | Same                                                                                                                                                                    |
| `export`          | Cursor (special) | **Not "true" pagination** — `nextCursor` is for resuming an interrupted NDJSON stream over >10k-doc datasets, not for paging a result list. `--paginate` carves it out. |

**Flags considered:**

| Flag         | From | Verdict  | Reason                                                                      |
| ------------ | ---- | -------- | --------------------------------------------------------------------------- |
| `--paginate` | gh   | **Keep** | 8/22 public specs use it; auto-paging is the cheapest agent ergonomics win. |

**Implementation notes:**

- **Detect style from the matched operation's spec metadata, not the response.** The operations index from Phase 1 already knows which query params an op accepts; we look for `cursor`/`nextCursor` (cursor mode) or `offset`+`limit` (offset mode) to pick the strategy. Falling back to response sniffing is acceptable but the spec-driven path is more reliable.
- **Cursor strategy:** read `nextCursor` from the response body; re-issue the same request with `?cursor=<value>` (or `?nextCursor=<value>` — matched from the param name) until `nextCursor` is `null`/absent or `hasMore: false`. Concatenate `.data` (or the spec's response array field) across pages into a single JSON array.
- **Offset strategy:** start at `?offset=0&limit=<spec default, else 100>`. Concatenate response arrays; stop when a page returns fewer items than `limit`.
- **Export carve-out:** `--paginate` against `export` errors with _"the export API uses `nextCursor` for stream resumption, not pagination. Pass `--input` cursors manually if you need to resume."_ — same shape as our other "this isn't what you want, do X instead" errors. Detect via spec slug or `Content-Type: application/x-ndjson`.
- Rejected for streaming SSE endpoints (Phase 8 territory) — they're handled there with explicit stream semantics.

**Tests:**

- Cursor pagination (using `access-api` shape fixture): three pages, third returns `nextCursor: null`; assert concatenated array.
- Offset pagination (using `webhooks` shape fixture): two full pages + one short; assert termination after short page.
- `hasMore: false` (using `user-attributes` shape): assert termination via the explicit flag, not the cursor.
- `--paginate` against `export`: clean error, exit non-zero, names the resumption use case.
- `--paginate` against a non-paginated endpoint (e.g. `jobs.jobStatus`): clean error suggesting the user drop the flag.

---

### Phase 7 — `--verbose` / `-v` and `--include` / `-i`

**Goal:** Debug visibility. Ship together because they overlap.

**Flags considered:**

| Flag            | From | Verdict  | Reason                                                                                                                    |
| --------------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `-v, --verbose` | gh   | **Keep** | Standard CLI hygiene. Emits request + response (incl. headers) to stderr.                                                 |
| `-i, --include` | gh   | **Keep** | Headers on stdout — different concern (scriptable).                                                                       |
| `--silent`      | gh   | **Drop** | `--silent` only suppresses _errors_ in gh, not stdout. With our `>/dev/null` UX we don't need it. Add later if requested. |

---

### Phase 8 — `--stream` (SSE handling)

**Goal:** Proper streaming for `listen`, `live`, `jobs.jobListen`. Auto-detect from response `Content-Type: text/event-stream`; `--stream` forces it.

**Flags considered:**

| Flag       | From | Verdict  | Reason                                                                                  |
| ---------- | ---- | -------- | --------------------------------------------------------------------------------------- |
| `--stream` | own  | **Keep** | Sanity has 3 SSE specs; auto-detect handles most cases, manual flag handles edge cases. |

**Implementation notes:**

- Stream stdout line-by-line; pretty-printing is skipped (the response isn't a single JSON document).
- Reject `--paginate` for streams.
- Honor `SIGINT` to close the stream cleanly.

---

### Phase 9 — `--cdn`

**Goal:** Route reads through `apicdn.sanity.io` for cache-friendly bulk queries.

**Flags considered:**

| Flag    | From            | Verdict  | Reason                                                 |
| ------- | --------------- | -------- | ------------------------------------------------------ |
| `--cdn` | Sanity-specific | **Keep** | Real performance lever for read-heavy agent workflows. |

**Behavior:**

- Only valid for `GET`. Reject for any other method (CDN doesn't accept writes).
- Surfaces stale data by definition; document that.

---

### Phase 10 — `sanity api search <query>` — semantic search via Sanity Embeddings

**Goal:** Natural-language discovery over the public HTTP spec surface. Instead of keyword grep, the agent asks _"how do I translate a document?"_ and gets ranked operations by semantic similarity. Powered by Sanity's own Embeddings Index API — eating our own dog food, no new vendor dependencies.

**Priority note:** the original framing demoted this to "ship only if needed." The Section 11 role-play (structural workflows) flipped that judgement — admin queries (`"audit robots and permissions"`, `"can this user publish?"`) have the widest vocab gap between what agents ask for and what spec paths/operationIds say. **Phase 10 is the highest-leverage post-demo phase**, not an optional add-on. Sequencing still defers it because of the cross-team dependency below, but ship it as soon as the index is available.

**Why embeddings, not local keyword:**

- `list --json | jq` already covers exact-keyword discovery. The agent pain point is vocabulary mismatch — the user thinks "transform," the spec says "translate"; the user thinks "publish," the spec says "release"; the user thinks "audit," the spec says "permissions." Embeddings bridge that gap.
- Sanity's Embeddings Index API exists, is public, and the docs project is the natural home for the index. The CLI just queries.

**Cross-team dependency (similar to Section 5.1's `revision` extension):** an embeddings index — proposed name `http-reference-search` — must be created on the `3do82whm/next` project, scoped to `*[_type == "openApiReference"]`, with anonymous query access. The docs team owns the index; the CLI just queries it via the public Embeddings Index API. **Blocker for Phase 10 PR.** Track alongside the `revision` request to the same team.

**Why scope to HTTP spec pages only:** the broader `next` dataset contains all of `sanity.io/docs` (guides, tutorials, marketing). An index over the whole thing would return tutorials when the agent asked for an API endpoint. Scoping the GROQ source to `openApiReference` documents only is the entire reason for a dedicated index — without that filter, this command would duplicate Kapa.ai's docs Q&A surface.

**Granularity (open decision, recommendation: per-spec for v1):**

| Approach           | Vectors  | UX                                                                         | Cost                                                                                   |
| ------------------ | -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Per-spec (v1)      | ~23      | Returns ranked specs; user follows up with `list --spec=<top>` to see ops. | Trivial — embed existing `openApiReference` documents as-is.                           |
| Per-operation (v2) | ~150–400 | Returns ranked operations directly. One-shot discovery.                    | Requires denormalizing each operation into its own embedded document on the docs side. |

**v1 ships per-spec.** It's enough to be useful, cheap to stand up, and the follow-up `list --spec=<x>` call is fast (warm cache from Phase 1).

**Commands:**

```
sanity api search "translate documents"
sanity api search "translate documents" --json
sanity api search "send a webhook" --limit=5
```

**Output (v1 — per-spec):**

```
SCORE  SPEC               TITLE                                DESCRIPTION
0.92   agent-actions      Agent Actions                        HTTP reference for AI-driven content ops (generate, transform, translate, prompt, patch).
0.81   content-agent      Content Agent API reference          Conversational interface to content via the headless Sanity Agent.
0.64   copy               Copy API reference                   Copy documents across datasets.

Next: `sanity api list --spec=agent-actions` to see operations in this spec.
```

**Behavior:**

- POST to the embeddings index query endpoint with the user's query string + top-K limit. Anonymous (the index is configured for public read alongside the openApiReference documents themselves).
- Map ranked results to spec slugs; pull title and description from the Phase 1 operations index (already on disk; no extra fetch).
- Default `--limit` 10. `--limit=0` returns all matches above a sensible default score threshold.

**Fallback (no-network, index unavailable, or new spec not yet in the index):** local keyword search across the operations index — same as the v0 implementation would have been. Triggered automatically with a single-line stderr warning so users know they're seeing the dumber result.

**Flags considered:**

| Flag                | From | Verdict       | Reason                                                                   |
| ------------------- | ---- | ------------- | ------------------------------------------------------------------------ |
| `--limit <n>`       | own  | **Keep**      | Default 10; embeddings can return many low-score matches.                |
| `--json`            | own  | **Keep**      | Agent-friendly structured output; `[{slug, score, title, description}]`. |
| `--threshold <0-1>` | own  | **Drop (v1)** | Default threshold suffices; expose only if users want to tune.           |
| `--spec <slug>`     | own  | **Drop (v1)** | Doesn't make sense for spec-level results; revisit at per-operation v2.  |

**Files touched:**

- Add: `packages/@sanity/cli/src/commands/api/search.ts` + tests.
- Add: `packages/@sanity/cli/src/openapi/embeddingsClient.ts` — thin anonymous client around the Sanity Embeddings Index API query endpoint.
- Reuse: Phase 1 operations index for title/description lookup and as the keyword-fallback corpus.

**Tests:**

- Mocked embeddings endpoint returns ranked slugs; assert table renders in score order.
- `--json` shape: array of `{slug, score, title, description}`.
- Embeddings endpoint 5xx / timeout: fallback to local keyword search; stderr warning emitted; exit 0.
- No matches above threshold: clean _"no matches — try different keywords"_ message; exit 0.

**Open questions for this phase:**

- Index naming convention (`http-reference-search` vs something else — coordinate with docs team).
- Refresh cadence — does the index rebuild on every spec deploy, or daily? Stale-by-a-day is acceptable for v1.
- Whether to surface scores numerically (precise) or as labels like "best match" (friendlier).

---

## 7. Flags explicitly dropped from upstream (won't ship in v1 or later without a new request)

| Flag                            | From   | Why dropped                                                                                                                                 |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh api graphql` shortcut       | gh     | Sanity uses GROQ; existing `sanity documents query`.                                                                                        |
| `--hostname`                    | gh     | No Enterprise / no self-hosted host.                                                                                                        |
| `-q, --jq <expr>`               | gh     | External `... \| jq` works fine; no need to vendor a second filter language.                                                                |
| `-t, --template` (Go templates) | gh     | `--json \| jq` covers it; second templating language is overhead.                                                                           |
| `--silent`                      | gh     | Confusing semantics (suppresses errors only); adds little. Reconsider on request.                                                           |
| `--no-auth`                     | own    | Auto-derived from spec's `security` block per operation; no flag needed.                                                                    |
| `--cache <duration>`            | gh     | Per-call response cache adds invalidation pain for marginal speed gain; rely on `sanity api refresh` (Phase 3) and external piping instead. |
| `--no-cache`                    | own    | Corollary of `--cache`; dropped together.                                                                                                   |
| `sanity api describe`           | own    | `list` now shows method + endpoint per operation — no intermediate step needed.                                                             |
| `sanity api <spec>.<opId>`      | own    | Endpoint string is already the addressable form; no op-id mode needed.                                                                      |
| Team-scope headers              | vercel | Sanity scopes by URL, not header.                                                                                                           |

---

## 8. Open questions

1. **`call` namespacing.** `sanity api <endpoint>` (positional path) vs `sanity api call <endpoint>` (explicit verb). Recommendation: positional (matches gh/vercel and is shorter); explicit `call` adds typing for no clarity gain.
2. **Capability tags.** Heuristic in Phase 1, or push for `x-sanity-capability` extension in producer-repo YAMLs? Heuristic is right for v1; revisit if false positives become noisy.
3. ~~**Telemetry for the MCP-gap signal.**~~ **Resolved** — existing CLI infrastructure already tags every outbound request: `User-Agent: @sanity/cli-core@<version>` (set unconditionally by `cli-core`'s `createRequester`, [`createRequester.ts:48-58`](packages/@sanity/cli-core/src/request/createRequester.ts#L48-L58)) plus `?tag=sanity.cli.api` (added by Phase 2 on every `sanity api` outbound; see Phase 2 behavior section). The MCP team filters server-side logs on `tag=sanity.cli.api` and groups by request path. No new telemetry pipeline.
4. ~~**Docs endpoint `revision` extension (blocker for Phase 1).**~~ **In review** — PR [`sanity-io/www-sanity-io#3740`](https://github.com/sanity-io/www-sanity-io/pull/3740) (branch `feat/openapi-index-revision-field`). Until it merges + deploys, the CLI's `revalidate.ts` falls back to "refetch every call" — slower but correct (see Section 5.2). Phase 1 has already shipped against this pre-merge state; the warm-cache fast path activates automatically once upstream populates `revision`.
5. **HTTP-reference embeddings index (blocker for Phase 10).** Requires a Sanity Embeddings Index on `3do82whm/next` scoped to `*[_type == "openApiReference"]`, with anonymous query access. Owned by the docs team; coordinate alongside the `revision` request. Without the index, Phase 10 ships as keyword-only fallback (still useful, but not the semantic experience).

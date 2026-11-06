/**
 * GENERATED FILE - DO NOT EDIT
 *
 * The Context API operations the context commands call, distilled from the
 * OpenAPI spec `@sanity/client` vendors.
 *
 * Regenerate with: pnpm generate:context-commands
 */
import {type ContextOperation} from '../actions/context/operationTypes.js'

export const contextOperations = {
  applyIssues: {
    body: 'required',
    description: 'Accepts the issues in `issueIds`, then queues a job that applies them, rewrites the affected entries, and saves a new revision. Returns a job ID. IDs of issues that no longer exist are skipped. Returns `409` with code `issueNotAutoApplicable`, and accepts none of the issues, if any of them cannot be applied: a `conflict` (resolve it with `POST .../issues/{issueId}/resolve`), or an `update_required` issue whose `scopePath` is `*` or names an entry that no longer exists. Dismiss those instead.',
    fields: [
      {
        description: 'The IDs of the issues to accept and apply.',
        in: 'body',
        name: 'issueIds',
        required: true,
        type: 'string[]'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/issues/apply',
    startsJob: true,
    summary: 'Accept and apply issues'
  },
  buildKnowledgeBase: {
    body: 'none',
    description: 'Queues a build over the knowledge base\'s current sources and returns a job ID immediately. If a build is already running, the response returns that build\'s job ID instead of starting a second build. A draft can\'t be built: the request returns `409` with code `knowledgeBaseIsDraft`.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/build',
    startsJob: true,
    summary: 'Start a knowledge base build'
  },
  confirmSync: {
    body: 'none',
    description: 'Deletes the documents a `held` sync didn\'t find, unless a sync has found them since, completes the sync, and starts a refresh of each knowledge base that uses the source, which removes their citations from entries. A sync that isn\'t `held` returns `409` with code `syncNotHeld`.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      },
      {
        description: 'The sync\'s ID.',
        name: 'syncId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}/confirm',
    startsJob: false,
    summary: 'Confirm a held sync\'s deletions'
  },
  createInstruction: {
    body: 'required',
    description: 'Creates a standing instruction for how entries built from its documents are written. Every instruction applies to specific documents, set in `scopeDocumentIds`. To rebuild entries under the new instruction right away, pass their paths in `rebuildPaths`. The response includes the rebuild job ID, or `null` if the rebuild could not start. The instruction is saved either way. After the instruction is saved, a background check files issues for entries that contradict it. If you already checked the instruction for contradictions, set `verified` to skip the background check. If the requested rebuild does not start, the background check runs even when `verified` is set.',
    fields: [
      {
        description: 'The instruction in plain language. Builds follow it over what the sources say.',
        in: 'body',
        name: 'statement',
        required: true,
        type: 'string'
      },
      {
        description: 'IDs of the documents the instruction applies to. Builds apply it when they write entries built from these documents. IDs of documents that no longer exist are dropped. If none exist, the request returns `422` with code `instructionScopeVanished`.',
        in: 'body',
        name: 'scopeDocumentIds',
        required: true,
        type: 'string[]'
      },
      {
        description: 'Paths of entries to rebuild under the new instruction right away. The response returns the rebuild job ID in `rebuildJobId`.',
        in: 'body',
        name: 'rebuildPaths',
        type: 'string[]'
      },
      {
        description: 'Whether you already checked the instruction for entries that contradict it. When `true`, the background check that files issues for those entries is skipped. It still runs if the rebuild you requested in `rebuildPaths` does not start.',
        in: 'body',
        name: 'verified',
        type: 'boolean'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/instructions',
    startsJob: false,
    summary: 'Create an instruction'
  },
  createKnowledgeBase: {
    body: 'required',
    description: 'Creates a knowledge base in your organization. To add content to it, add a source. Set `draft` to `true` to create a draft, which needs no title or description until you finish it. If your organization\'s Context document store can\'t be used, the request returns `503` with code `contextStoreUnavailable` and you can retry.',
    fields: [
      {
        description: 'The ID of the organization to create the knowledge base in.',
        in: 'body',
        name: 'organizationId',
        required: true,
        type: 'string'
      },
      {
        description: 'The knowledge base\'s title. Required unless `draft` is `true`.',
        in: 'body',
        name: 'title',
        type: 'string'
      },
      {
        description: 'A short description of what the knowledge base covers. Required unless `draft` is `true`.',
        in: 'body',
        name: 'description',
        type: 'string'
      },
      {
        description: 'Whether to create the knowledge base as a draft. You can add sources to a draft, and they sync right away, but you can\'t build it, and the list leaves it out unless you set `includeDrafts` to `true`. A draft counts toward your plan\'s knowledge base limit. To finish it, update it with `draft` set to `false`.',
        in: 'body',
        name: 'draft',
        type: 'boolean'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [],
    route: 'POST /knowledge-bases',
    startsJob: false,
    summary: 'Create a knowledge base'
  },
  createSource: {
    body: 'required',
    description: 'Adds a source to a knowledge base. Set `type` to choose what it reads:\n\n- `web`: a website, crawled from `url`\n- `sanity-dataset`: the documents a GROQ query selects in a Sanity dataset\n- `files`: files you upload with `POST .../sources/{sourceId}/uploads`, or text you send in `content`\n\nA website or dataset starts its first sync right away. A `files` source syncs when you upload a file, or right away when you send `content`: one request stores the text, adds the source and starts its sync. For a website, set `dryRun` to `true` to preview the crawl without adding the source.\n\nAdding a website that is already a source returns `409` with code `webSourceRootConflict`, and adding more websites than your limit allows returns `409` with code `webSourceRootLimitExceeded`. When the organization\'s knowledge bases already hold as many source chunks as its plan allows, returns `403` with code `planLimitReached` and adds nothing. Supports the `Idempotency-Key` header.',
    fields: [
      {
        description: 'The source type. `web` crawls a website.',
        in: 'body',
        name: 'type',
        options: [
          'web',
          'sanity-dataset',
          'files'
        ],
        required: true,
        type: 'string'
      },
      {
        description: 'The URL to start crawling from. It must be a public `http` or `https` URL.',
        in: 'body',
        name: 'url',
        type: 'string',
        variants: [
          'web'
        ]
      },
      {
        description: 'Regular expressions for URL paths to crawl. When set, the crawl only includes pages whose path matches one of them.',
        in: 'body',
        name: 'includePaths',
        parent: 'crawlOptions',
        type: 'string[]',
        variants: [
          'web'
        ]
      },
      {
        description: 'Regular expressions for URL paths to skip. Pages whose path matches one of them aren\'t crawled.',
        in: 'body',
        name: 'excludePaths',
        parent: 'crawlOptions',
        type: 'string[]',
        variants: [
          'web'
        ]
      },
      {
        description: 'How many levels deep the crawl goes from the root URL.',
        in: 'body',
        name: 'maxDepth',
        parent: 'crawlOptions',
        type: 'integer',
        variants: [
          'web'
        ]
      },
      {
        description: 'Whether to crawl only the pages listed in the site\'s sitemap.',
        in: 'body',
        name: 'sitemapOnly',
        parent: 'crawlOptions',
        type: 'boolean',
        variants: [
          'web'
        ]
      },
      {
        description: 'Whether to treat URLs that differ only by query string as one page. New crawls set it to `true` unless you set it. Set it to `false` when the query string selects different content, such as pagination.',
        in: 'body',
        name: 'ignoreQueryParameters',
        parent: 'crawlOptions',
        type: 'boolean',
        variants: [
          'web'
        ]
      },
      {
        description: 'The maximum number of pages to crawl. The crawl can stop sooner when the knowledge base reaches its source limit.',
        in: 'body',
        name: 'pageLimit',
        parent: 'crawlOptions',
        type: 'integer',
        variants: [
          'web'
        ]
      },
      {
        description: 'Set to `true` to estimate what a crawl would fetch without adding the source. The response is then `200` with a preview of the pages the site has, grouped by path.',
        in: 'body',
        name: 'dryRun',
        type: 'boolean',
        variants: [
          'web'
        ]
      },
      {
        description: 'The ID of the Sanity project to read documents from. You need full read access to the dataset and, on its project, the Administrator or Developer role or a custom role that can create datasets.',
        in: 'body',
        name: 'sanityProjectId',
        type: 'string',
        variants: [
          'sanity-dataset'
        ]
      },
      {
        description: 'The dataset to read documents from.',
        in: 'body',
        name: 'sanityDatasetId',
        type: 'string',
        variants: [
          'sanity-dataset'
        ]
      },
      {
        description: 'A GROQ query that selects the documents, with an optional projection. It can match up to 5,000 documents. Each sync runs it again.',
        in: 'body',
        name: 'query',
        type: 'string',
        variants: [
          'sanity-dataset'
        ]
      },
      {
        description: 'The source\'s title.',
        in: 'body',
        name: 'title',
        type: 'string',
        variants: [
          'files'
        ]
      },
      {
        description: 'Text or markdown for the source to hold, up to 1,000,000 bytes of UTF-8. The source syncs it at once, with no upload. Larger content goes through `POST .../sources/{sourceId}/uploads`.',
        in: 'body',
        name: 'content',
        type: 'string',
        variants: [
          'files'
        ]
      },
      {
        description: 'The format of `content`: `text/markdown` (the default) or `text/plain`. Only with `content`.',
        in: 'body',
        name: 'contentType',
        options: [
          'text/markdown',
          'text/plain'
        ],
        type: 'string',
        variants: [
          'files'
        ]
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sources',
    startsJob: false,
    summary: 'Add a source'
  },
  deleteDocument: {
    body: 'none',
    description: 'Deletes a document from its source. A page that is still on the website comes back on the next sync of its source unless the crawl options exclude it. Entries that cite the document stay the same until the next build or refresh, which removes the citations.',
    fields: [],
    noContent: true,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The document\'s ID.',
        name: 'documentId'
      }
    ],
    route: 'DELETE /knowledge-bases/{knowledgeBaseId}/documents/{documentId}',
    startsJob: false,
    summary: 'Delete a document'
  },
  deleteInstruction: {
    body: 'none',
    description: 'Deletes the instruction. Builds stop applying it from the next run. Entries already written under it keep their text until they are rebuilt; pass `rebuild=true` to rebuild every entry built from its documents right away.',
    fields: [
      {
        description: 'Set to `true` to rebuild every entry built from the instruction\'s documents once it is deleted, so pages written under the instruction reflect their documents again. The response returns the rebuild job ID in `rebuildJobId`.',
        in: 'query',
        name: 'rebuild',
        type: 'boolean'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The instruction\'s ID.',
        name: 'instructionId'
      }
    ],
    route: 'DELETE /knowledge-bases/{knowledgeBaseId}/instructions/{instructionId}',
    startsJob: false,
    summary: 'Delete an instruction'
  },
  deleteKnowledgeBase: {
    body: 'none',
    description: 'Deletes the knowledge base and everything it owns: its sources, revisions, stored source files, and its documents in your organization\'s document store. While a build, refresh, apply, or sync is running, the request returns `409` with code `buildInFlight`. Retry after that work finishes.',
    fields: [],
    noContent: true,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'DELETE /knowledge-bases/{knowledgeBaseId}',
    startsJob: false,
    summary: 'Delete a knowledge base'
  },
  deleteSource: {
    body: 'none',
    description: 'Removes a source and its documents from the knowledge base, and starts a refresh that removes their citations from entries and deletes the entries left with none. A source no other knowledge base uses stops syncing and is deleted once that refresh has run.',
    fields: [],
    noContent: true,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'DELETE /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
    startsJob: false,
    summary: 'Delete a source'
  },
  discardSync: {
    body: 'none',
    description: 'Completes a `held` sync without deleting anything: every document stays as it is. A sync that isn\'t `held` returns `409` with code `syncNotHeld`.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      },
      {
        description: 'The sync\'s ID.',
        name: 'syncId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}/discard',
    startsJob: false,
    summary: 'Discard a held sync\'s deletions'
  },
  dismissIssue: {
    body: 'none',
    description: 'Marks the issue as rejected. If the issue already left triage, the request returns it unchanged. Returns `422` with code `issueDocumentInvalid` if the issue document was edited into a shape the API cannot verify. Returns `409` with code `issueTransitionConflict` if another change to the issue happened at the same time. You can safely retry a `409`.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The issue\'s document ID.',
        name: 'issueId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/dismiss',
    startsJob: false,
    summary: 'Dismiss an issue'
  },
  getDocument: {
    body: 'none',
    description: 'Returns a document with its conversion status and the chunks of its markdown. Entry citations point at a document\'s chunks.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The document\'s ID.',
        name: 'documentId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/documents/{documentId}',
    startsJob: false,
    summary: 'Get a document'
  },
  getDocumentContent: {
    body: 'none',
    description: 'Returns the markdown a document converted to: the text builds read, and the line numbers citations use. Set `chunk` or `lines` to get part of it, and `format` to `markdown` or `plain` to get the text alone instead of JSON. Until the document is converted, the request returns `409` with code `documentNotConverted`. With `format=raw` it returns the document as its source gave it, as an attachment, or `409` with code `documentNotStored` when the document was too large to keep.',
    fields: [
      {
        description: 'Response format. `json` (default) returns the markdown with its line numbers. `markdown` and `plain` return the markdown alone, ready to pass to a model. `raw` returns the bytes the source gave, before conversion: the uploaded file, the crawled page, the dataset document as JSON.',
        in: 'query',
        name: 'format',
        options: [
          'json',
          'markdown',
          'plain',
          'raw'
        ],
        type: 'string'
      },
      {
        description: 'Return only this chunk\'s lines. Citations name the chunk they quote.',
        in: 'query',
        name: 'chunk',
        type: 'string'
      },
      {
        description: 'Return only these lines, from 1 and inclusive: `10-20`, or `10` for line 10 to the end. A range past the end returns up to the last line.',
        in: 'query',
        name: 'lines',
        type: 'string'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The document\'s ID.',
        name: 'documentId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/documents/{documentId}/content',
    startsJob: false,
    summary: 'Get a document\'s markdown'
  },
  getJob: {
    body: 'none',
    description: 'Returns the status of a background job, such as a build, sync, or refresh. The endpoint that starts the work returns the job ID.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The job ID returned by the endpoint that started the work.',
        name: 'jobId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}',
    startsJob: false,
    summary: 'Get a job'
  },
  getKnowledgeBase: {
    body: 'none',
    description: 'Returns a knowledge base\'s metadata and state. `knowledgeBaseId` accepts the public ID (`kb...`) or the UUID, and you don\'t need to pass an organization. If you can\'t read the knowledge base, the request returns `404`. To read the built entries, query `sanity.context.entry` documents with GROQ from your organization\'s document store.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}',
    startsJob: false,
    summary: 'Get a knowledge base'
  },
  getMcpEndpointInitialContext: {
    body: 'none',
    description: 'Returns the same text as the `initial_context` MCP tool, as plain text you can add to a system prompt. `heading_offset` shifts markdown headings down by that many levels. The default is `1`, so `#` becomes `##`.',
    fields: [
      {
        description: 'A JSON array that adds `_url` fields to query results. Each item has `types` (document types), `baseUrl`, and an optional `slugExpression`, a GROQ expression that defaults to `slug.current`. Invalid JSON is ignored.',
        in: 'query',
        name: 'linkResolver',
        type: 'string'
      },
      {
        description: 'How many levels to shift markdown headings down, from `0` to `6`. Defaults to `1`, so `#` becomes `##`.',
        in: 'query',
        name: 'heading_offset',
        type: 'string'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The ID of the organization.',
        name: 'organizationId'
      },
      {
        description: 'The MCP endpoint\'s name, set when the endpoint was created.',
        name: 'mcpEndpoint'
      }
    ],
    route: 'GET /organizations/{organizationId}/mcp/{mcpEndpoint}/initial-context',
    startsJob: false,
    summary: 'Get an MCP endpoint\'s initial context'
  },
  getSource: {
    body: 'none',
    description: 'Returns a source with its settings, document counts and latest sync.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
    startsJob: false,
    summary: 'Get a source'
  },
  getSync: {
    body: 'none',
    description: 'Returns one sync of a source with its status and counts.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      },
      {
        description: 'The sync\'s ID.',
        name: 'syncId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}',
    startsJob: false,
    summary: 'Get a sync'
  },
  listDocuments: {
    body: 'none',
    description: 'Lists the documents in a knowledge base: the pages, dataset documents and files its sources yield, which builds read and cite. Results are cursor-paginated, and you can filter them by `source` and `state`.',
    fields: [
      {
        description: 'The `nextCursor` value from the previous page. Omit it to get the first page.',
        in: 'query',
        name: 'cursor',
        type: 'string'
      },
      {
        description: 'The maximum number of items to return.',
        in: 'query',
        name: 'limit',
        type: 'integer'
      },
      {
        description: 'Return only the documents of this source.',
        in: 'query',
        name: 'source',
        type: 'string'
      },
      {
        description: 'Return only documents in this state. Without it, `deleted` documents are left out.',
        in: 'query',
        name: 'state',
        options: [
          'active',
          'missing',
          'deleted'
        ],
        type: 'string'
      },
      {
        description: 'Comma-separated IDs of the documents to return, up to 200, in any state. Use it to look up the documents entry citations point at.',
        in: 'query',
        name: 'ids',
        type: 'string'
      }
    ],
    noContent: false,
    pageSize: 200,
    paginated: true,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/documents',
    startsJob: false,
    summary: 'List documents'
  },
  listKnowledgeBases: {
    body: 'none',
    description: 'Returns the knowledge bases you can access in the organization set by `organizationId`. Drafts are left out unless you set `includeDrafts` to `true`. Results are cursor-paginated, newest first.',
    fields: [
      {
        description: 'The `nextCursor` value from the previous page. Omit it to get the first page.',
        in: 'query',
        name: 'cursor',
        type: 'string'
      },
      {
        description: 'The maximum number of items to return.',
        in: 'query',
        name: 'limit',
        type: 'integer'
      },
      {
        description: 'The organization to list knowledge bases for.',
        in: 'query',
        name: 'organizationId',
        required: true,
        type: 'string'
      },
      {
        description: 'Set to `true` to also list the organization\'s drafts, which have `state` set to `draft`. Drafts count toward the plan\'s knowledge base limit, and `createdBy` says who started each one.',
        in: 'query',
        name: 'includeDrafts',
        type: 'boolean'
      }
    ],
    noContent: false,
    pageSize: 200,
    paginated: true,
    pathParams: [],
    route: 'GET /knowledge-bases',
    startsJob: false,
    summary: 'List knowledge bases'
  },
  listSources: {
    body: 'none',
    description: 'Lists the sources of a knowledge base: the websites, Sanity datasets and files its documents come from, each with its document counts and its latest sync. Results are cursor-paginated.',
    fields: [
      {
        description: 'The `nextCursor` value from the previous page. Omit it to get the first page.',
        in: 'query',
        name: 'cursor',
        type: 'string'
      },
      {
        description: 'The maximum number of items to return.',
        in: 'query',
        name: 'limit',
        type: 'integer'
      }
    ],
    noContent: false,
    pageSize: 200,
    paginated: true,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/sources',
    startsJob: false,
    summary: 'List sources'
  },
  listSyncs: {
    body: 'none',
    description: 'Lists the syncs of a source, newest first. Results are cursor-paginated.',
    fields: [
      {
        description: 'The `nextCursor` value from the previous page. Omit it to get the first page.',
        in: 'query',
        name: 'cursor',
        type: 'string'
      },
      {
        description: 'The maximum number of items to return.',
        in: 'query',
        name: 'limit',
        type: 'integer'
      }
    ],
    noContent: false,
    pageSize: 200,
    paginated: true,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs',
    startsJob: false,
    summary: 'List a source\'s syncs'
  },
  rebuildEntry: {
    body: 'none',
    description: 'Queues a rewrite of the entry at `entryPath` from its cited sources and the active instructions, and returns a job ID immediately. The response also lists the other entries built from any of the same sources. An instruction applies to every entry built from its sources, so those entries can change too. Returns `422` with code `entryDocumentInvalid` if the entry document was edited into a shape the API cannot read.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The entry\'s slash-delimited path, such as `pricing/plans/free`, URL-encoded.',
        name: 'entryPath'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/entries/{entryPath}/rebuild',
    startsJob: true,
    summary: 'Rebuild an entry from its sources'
  },
  reopenIssue: {
    body: 'none',
    description: 'Returns an accepted conflict issue to triage, clears its resolution, and deletes the instruction the resolution created. Reopening an open or dismissed conflict returns it unchanged. Other issue types return `422` with code `issueNotResolvable`.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The issue\'s document ID.',
        name: 'issueId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/reopen',
    startsJob: false,
    summary: 'Reopen an accepted conflict'
  },
  resolveIssue: {
    body: 'required',
    description: 'Resolves a conflict issue by choosing one of its sides. Set `resolution` to the index of a side in `content.sides`. For a conflict on a single entry, index `0` is the entry\'s current content, so choosing it keeps the entry as it is. Choosing any other side rewrites the entry, and the returned `jobId` tracks the rewrite. The decision becomes a standing instruction for every future build, and `resolvedBy` records who made it. To change a decision, resolve the accepted conflict again. Other issue types, dismissed conflicts, and out-of-range indexes return `422` with code `issueNotResolvable`.',
    fields: [
      {
        description: 'The index of the chosen side in the issue\'s `content.sides`.',
        in: 'body',
        name: 'resolution',
        required: true,
        type: 'integer'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The issue\'s document ID.',
        name: 'issueId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/resolve',
    startsJob: true,
    summary: 'Resolve a conflict issue'
  },
  startSourceUpload: {
    body: 'required',
    description: 'Returns a single-use signed URL for one file of a `files` source, valid for one hour. To add the file:\n\n1. Send the file in a `PUT` request to `uploadUrl`.\n2. Call `POST .../sources/{sourceId}/syncs` with the `uploadId`.\n\nThe file can be a single document or a zip, tar or gzip archive of them. It replaces the source\'s current file when it syncs. An upload no sync takes within 24 hours is deleted. A source that isn\'t `files` returns `422` with code `sourceTypeMismatch`. When the organization\'s knowledge bases already hold as many source chunks as its plan allows, returns `403` with code `planLimitReached`. Supports the `Idempotency-Key` header.',
    fields: [
      {
        description: 'The file\'s name.',
        in: 'body',
        name: 'filename',
        required: true,
        type: 'string'
      },
      {
        description: 'The media type of the file. When set, the `PUT` request must send the same `Content-Type` header.',
        in: 'body',
        name: 'contentType',
        type: 'string'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/uploads',
    startsJob: false,
    summary: 'Upload a file to a source'
  },
  startSync: {
    body: 'required',
    description: 'Starts a sync of the source. A website or dataset is read again: its sync is queued, and starts once any sync of the source that is running ends, including the first one that started when it was added. Asking again while one waits queues nothing more. Follow it with the source\'s `latestSync`.\n\nFor a `files` source, set `uploadId` to the upload whose file the source should hold from now on; without it, the source reads its current file again. Its sync starts at once and returns a job ID to poll; the finished job\'s `result` names the sync and whether it is `held`. While a sync of a `files` source is running, including the first one, the request returns `409` with code `syncInProgress` and leaves the upload for a later request. An `uploadId` whose file never arrived returns `404` with code `uploadNotFound`, and an `uploadId` on a source that isn\'t `files` returns `422` with code `sourceTypeMismatch`.\n\nSupports the `Idempotency-Key` header.',
    fields: [
      {
        description: 'For a `files` source, the `uploadId` of the file to sync, from `POST .../sources/{sourceId}/uploads`. Without it, a `files` source reads its current file again. Not allowed for other types.',
        in: 'body',
        name: 'uploadId',
        type: 'string'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs',
    startsJob: true,
    summary: 'Sync a source'
  },
  syncAllSources: {
    body: 'none',
    description: 'Queues a sync of every website and dataset source, which starts once any sync of the source that is running ends. `files` sources sync when you upload a file.',
    fields: [],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'POST /knowledge-bases/{knowledgeBaseId}/sync',
    startsJob: false,
    summary: 'Sync every source'
  },
  updateDocument: {
    body: 'required',
    description: 'Keeps a `missing` web page in the knowledge base by setting its `state` back to `active`. A document that isn\'t `missing` returns `409` with code `documentInvalidState`.',
    fields: [
      {
        description: 'Set to `active` to keep a `missing` page in the knowledge base. The count of crawls that missed it starts again.',
        in: 'body',
        name: 'state',
        options: [
          'active'
        ],
        required: true,
        type: 'string'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The document\'s ID.',
        name: 'documentId'
      }
    ],
    route: 'PATCH /knowledge-bases/{knowledgeBaseId}/documents/{documentId}',
    startsJob: false,
    summary: 'Keep a missing document'
  },
  updateInstruction: {
    body: 'required',
    description: 'Updates the instruction\'s statement or documents. The change applies from the next build. Any update also reactivates an archived instruction and ties it to the current content of its documents.',
    fields: [
      {
        description: 'The new instruction text. Omit it to keep the current text.',
        in: 'body',
        name: 'statement',
        type: 'string'
      },
      {
        description: 'IDs of the documents the instruction applies to. Replaces the current list. Omit it to keep the current documents. IDs of documents that no longer exist are dropped. If none exist, the request returns `422` with code `instructionScopeVanished`.',
        in: 'body',
        name: 'scopeDocumentIds',
        type: 'string[]'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The instruction\'s ID.',
        name: 'instructionId'
      }
    ],
    route: 'PATCH /knowledge-bases/{knowledgeBaseId}/instructions/{instructionId}',
    startsJob: false,
    summary: 'Update an instruction'
  },
  updateKnowledgeBase: {
    body: 'required',
    description: 'Updates the title or the description, or finishes a draft (`draft: false`). Fields equal to their current value are ignored, so sending the current values changes nothing. Finishing a draft with no title returns `422` with code `draftTitleRequired`. How often a website or dataset syncs is set on the source, with `PATCH .../sources/{sourceId}`.',
    fields: [
      {
        description: 'The knowledge base\'s new title.',
        in: 'body',
        name: 'title',
        type: 'string'
      },
      {
        description: 'The knowledge base\'s new description.',
        in: 'body',
        name: 'description',
        type: 'string'
      },
      {
        description: 'Set to `false` to finish a draft, so it can be built and is listed with your other knowledge bases. The knowledge base needs a title, sent here or set before. Ignored when the knowledge base isn\'t a draft. A finished knowledge base can\'t become a draft again.',
        in: 'body',
        name: 'draft',
        type: 'boolean'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      }
    ],
    route: 'PATCH /knowledge-bases/{knowledgeBaseId}',
    startsJob: false,
    summary: 'Update a knowledge base'
  },
  updateSource: {
    body: 'required',
    description: 'Changes a source\'s title, a website\'s crawl options, a dataset\'s query, or how often a website or dataset syncs on its own. New crawl options delete the documents whose path they leave out. When that would delete all of the source\'s documents, or five or more that are over a fifth of them, the request returns `409` with code `sourceDeletionsUnconfirmed` until you send it again with `confirmDeletions` set to `true`. New crawl options sent while the source syncs return `409` with code `syncInProgress`; send them again once the sync finishes. A new query queues a sync, which removes the documents the query no longer selects.\n\nCrawl options on a source that isn\'t a website, a query on one that isn\'t a dataset, or a sync frequency on a `files` source, return `422` with code `sourceTypeMismatch`. Setting a sync frequency on a plan without scheduled syncs returns `403` with code `featureNotInPlan`; setting it to `null` always works.',
    fields: [
      {
        description: 'The source\'s title.',
        in: 'body',
        name: 'title',
        type: 'string'
      },
      {
        description: 'Regular expressions for URL paths to crawl. When set, the crawl only includes pages whose path matches one of them.',
        in: 'body',
        name: 'includePaths',
        parent: 'crawlOptions',
        type: 'string[]'
      },
      {
        description: 'Regular expressions for URL paths to skip. Pages whose path matches one of them aren\'t crawled.',
        in: 'body',
        name: 'excludePaths',
        parent: 'crawlOptions',
        type: 'string[]'
      },
      {
        description: 'How many levels deep the crawl goes from the root URL.',
        in: 'body',
        name: 'maxDepth',
        parent: 'crawlOptions',
        type: 'integer'
      },
      {
        description: 'Whether to crawl only the pages listed in the site\'s sitemap.',
        in: 'body',
        name: 'sitemapOnly',
        parent: 'crawlOptions',
        type: 'boolean'
      },
      {
        description: 'Whether to treat URLs that differ only by query string as one page. New crawls set it to `true` unless you set it. Set it to `false` when the query string selects different content, such as pagination.',
        in: 'body',
        name: 'ignoreQueryParameters',
        parent: 'crawlOptions',
        type: 'boolean'
      },
      {
        description: 'The maximum number of pages to crawl. The crawl can stop sooner when the knowledge base reaches its source limit.',
        in: 'body',
        name: 'pageLimit',
        parent: 'crawlOptions',
        type: 'integer'
      },
      {
        description: 'For a `sanity-dataset` source, the GROQ query, replacing the stored one. A sync is queued, and removes the documents the query no longer returns.',
        in: 'body',
        name: 'query',
        type: 'string'
      },
      {
        description: 'For a `web` or `sanity-dataset` source, how often it syncs on its own: `weekly` or `monthly`. `null` stops scheduled syncs, and you can still start a sync yourself. Setting a frequency requires a plan that includes scheduled syncs; without one, the request returns `403` with code `featureNotInPlan`.',
        in: 'body',
        name: 'syncFrequency',
        nullable: true,
        options: [
          'weekly',
          'monthly'
        ],
        type: 'string'
      },
      {
        description: 'Set to `true` to apply new crawl options that delete many documents. Without it, a change that would delete all of the documents, or five or more that are over a fifth of them, returns `409` with code `sourceDeletionsUnconfirmed`.',
        in: 'body',
        name: 'confirmDeletions',
        type: 'boolean'
      }
    ],
    noContent: false,
    paginated: false,
    pathParams: [
      {
        description: 'The knowledge base\'s ID (`kb...`), its `publicId`. Its UUID `id` is also accepted.',
        name: 'knowledgeBaseId'
      },
      {
        description: 'The source\'s ID.',
        name: 'sourceId'
      }
    ],
    route: 'PATCH /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
    startsJob: false,
    summary: 'Update a source'
  }
} as const satisfies Record<string, ContextOperation>

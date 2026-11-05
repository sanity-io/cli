/**
 * The Context commands generated from the Context API's OpenAPI spec: one
 * command per operation. `pnpm generate:context-commands` reads this table and
 * the spec `@sanity/client` vendors, and writes the operation metadata
 * (`src/generated/contextOperations.ts`) and one command file per entry.
 *
 * Path parameters become arguments; query and body fields become flags, with
 * their types, enums and descriptions from the spec. The fields below cover
 * only what the spec can't say.
 */
export interface ContextCommandEntry {
  /** The command id, after `sanity` */
  readonly id: string
  /** The Context API operation the command calls */
  readonly operationId: string

  /** Columns of the table a list renders, in order; the item's scalar fields when left out */
  readonly columns?: readonly string[]
  /** A check that runs before the request, such as refusing a resource a blueprint manages */
  readonly guard?: 'knowledgeBaseBlueprint'
  /**
   * The command file is hand-written: a class extending `contextCommand(id)`
   * that adds what the spec can't describe, such as reading a local file
   */
  readonly handWritten?: true
  /** Body fields left out of the flags */
  readonly omit?: readonly string[]
  /** Body fields to prompt for when interactive and not passed as flags */
  readonly prompt?: readonly string[]
  /** A string array body field taken from the remaining arguments instead of a flag */
  readonly variadicArg?: string
  /** What `--watch` waits for: the job the response starts, or the sync of the source */
  readonly watch?: 'job' | 'sync'
}

export const contextCommandTable = [
  {
    columns: ['publicId', 'title', 'state', 'openIssueCount', 'updatedAt'],
    id: 'context list',
    operationId: 'listKnowledgeBases',
  },
  {id: 'context create', operationId: 'createKnowledgeBase', prompt: ['title', 'description']},
  {id: 'context get', operationId: 'getKnowledgeBase'},
  {guard: 'knowledgeBaseBlueprint', id: 'context update', operationId: 'updateKnowledgeBase'},
  {guard: 'knowledgeBaseBlueprint', id: 'context delete', operationId: 'deleteKnowledgeBase'},
  {id: 'context sync', operationId: 'syncAllSources'},
  {handWritten: true, id: 'context build', operationId: 'buildKnowledgeBase', watch: 'job'},

  {
    columns: ['id', 'type', 'title', 'documentCount', 'syncFrequency', 'updatedAt'],
    id: 'context sources list',
    operationId: 'listSources',
  },
  {
    handWritten: true,
    id: 'context sources create',
    omit: ['content'],
    operationId: 'createSource',
    watch: 'sync',
  },
  {id: 'context sources get', operationId: 'getSource'},
  {handWritten: true, id: 'context sources edit', operationId: 'updateSource'},
  {id: 'context sources delete', operationId: 'deleteSource'},
  {id: 'context sources sync', omit: ['uploadId'], operationId: 'startSync', watch: 'sync'},
  {
    handWritten: true,
    id: 'context sources upload',
    omit: ['filename', 'contentType'],
    operationId: 'startSourceUpload',
    watch: 'sync',
  },
  {
    columns: ['id', 'status', 'trigger', 'documentsSeen', 'documentsUpserted', 'createdAt'],
    id: 'context sources syncs list',
    operationId: 'listSyncs',
  },
  {id: 'context sources syncs get', operationId: 'getSync'},
  {id: 'context sources syncs confirm', operationId: 'confirmSync'},
  {id: 'context sources syncs discard', operationId: 'discardSync'},

  {
    columns: ['id', 'title', 'state', 'conversion', 'url', 'updatedAt'],
    id: 'context documents list',
    operationId: 'listDocuments',
  },
  {id: 'context documents get', operationId: 'getDocument'},
  {handWritten: true, id: 'context documents content', operationId: 'getDocumentContent'},
  {id: 'context documents edit', operationId: 'updateDocument'},
  {id: 'context documents delete', operationId: 'deleteDocument'},

  {id: 'context entries rebuild', operationId: 'rebuildEntry', watch: 'job'},
  {id: 'context jobs get', operationId: 'getJob', watch: 'job'},

  {id: 'context issues apply', operationId: 'applyIssues', variadicArg: 'issueIds', watch: 'job'},
  {id: 'context issues dismiss', operationId: 'dismissIssue'},
  {id: 'context issues reopen', operationId: 'reopenIssue'},
  {
    handWritten: true,
    id: 'context issues resolve',
    omit: ['resolution'],
    operationId: 'resolveIssue',
    watch: 'job',
  },

  {id: 'context instructions create', operationId: 'createInstruction'},
  {id: 'context instructions edit', operationId: 'updateInstruction'},
  {id: 'context instructions delete', operationId: 'deleteInstruction'},

  {id: 'context mcp initial-context', operationId: 'getMcpEndpointInitialContext'},
] as const satisfies readonly ContextCommandEntry[]

export type ContextCommandId = (typeof contextCommandTable)[number]['id']

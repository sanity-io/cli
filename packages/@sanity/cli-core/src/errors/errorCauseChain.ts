/**
 * A single link in an error's `cause` chain, in a structured-cloneable shape
 * that can cross a worker `postMessage` boundary.
 *
 * @internal
 */
export interface SerializedErrorCause {
  message: string
  name: string

  code?: string
}

/** Guards against pathological or self-referential cause chains. */
const MAX_CAUSE_DEPTH = 10

/**
 * Flatten an error's `cause` chain (excluding the error itself) into serializable
 * entries, preserving transport-level detail like `code` (e.g. `ETIMEDOUT`,
 * `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`) that plain `error.message` drops.
 *
 * @param error - The error whose cause chain should be flattened
 * @returns The serialized causes, outermost first
 * @internal
 */
export function flattenErrorCauses(error: unknown): SerializedErrorCause[] {
  const causes: SerializedErrorCause[] = []
  let current = error instanceof Error ? error.cause : undefined
  while (current !== undefined && current !== null && causes.length < MAX_CAUSE_DEPTH) {
    if (current instanceof Error) {
      causes.push({
        ...('code' in current && typeof current.code === 'string' ? {code: current.code} : {}),
        message: current.message,
        name: current.name,
      })
      current = current.cause
    } else {
      causes.push({message: String(current), name: 'Error'})
      current = undefined
    }
  }
  return causes
}

/**
 * Format a flattened cause chain as a single-line summary, e.g.
 * `TypeError: fetch failed <- ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error`.
 *
 * @param causes - The serialized causes to format, outermost first
 * @returns The formatted summary, or an empty string when there are no causes
 * @internal
 */
export function formatErrorCauses(causes: SerializedErrorCause[]): string {
  return causes
    .map((cause) => `${cause.name}${cause.code ? ` [${cause.code}]` : ''}: ${cause.message}`)
    .join(' <- ')
}

/**
 * Rebuild an `Error` `cause` chain from its serialized form, so cause-aware
 * renderers can walk it again after it crossed a worker boundary.
 *
 * @param causes - The serialized causes, outermost first
 * @returns The outermost rebuilt error, or `undefined` when there are no causes
 * @internal
 */
export function rebuildErrorCauseChain(causes: SerializedErrorCause[]): Error | undefined {
  let rebuilt: Error | undefined
  for (const serialized of causes.toReversed()) {
    const error = new Error(serialized.message, rebuilt ? {cause: rebuilt} : undefined)
    error.name = serialized.name
    if (serialized.code) {
      Object.assign(error, {code: serialized.code})
    }
    rebuilt = error
  }
  return rebuilt
}

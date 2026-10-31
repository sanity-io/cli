import {type SanityDocument} from '@sanity/client'
import {isReference} from '@sanity/types'

export const DOCUMENT_VALIDATION_TIMEOUT = 30_000
export const MAX_VALIDATION_CONCURRENCY = 100
export const REFERENCE_INTEGRITY_BATCH_SIZE = 100

export const levelValues = {error: 0, info: 2, warning: 1} as const

export const getReferenceIds = (value: unknown) => {
  const ids = new Set<string>()

  function traverse(node: unknown) {
    if (isReference(node)) {
      ids.add(node._ref)
      return
    }

    if (typeof node === 'object' && node) {
      // Note: this works for arrays too
      for (const item of Object.values(node)) traverse(item)
    }
  }

  traverse(value)

  return ids
}

const idRegex = /^[^-][A-Z0-9._-]*$/i

// during testing, the `doc` endpoint 502'ed if given an invalid ID
export const isValidId = (id: unknown) => typeof id === 'string' && idRegex.test(id)
export const shouldIncludeDocument = (document: SanityDocument) => {
  // Filter out system documents and sanity documents
  return !document._type.startsWith('system.') && !document._type.startsWith('sanity.')
}

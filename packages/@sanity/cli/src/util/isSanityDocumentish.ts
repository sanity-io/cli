import {type IdentifiedSanityDocumentStub} from '@sanity/client'

/**
 * Checks if a document is a Sanity document
 * @param doc - The document to check
 * @returns True if the document is a Sanity document, false otherwise
 *
 * @internal
 */
export function isSanityDocumentish(doc: unknown): doc is {_type: string} {
  return (
    doc !== null &&
    typeof doc === 'object' &&
    '_type' in doc &&
    typeof (doc as Record<string, unknown>)._type === 'string'
  )
}

/**
 * Checks if a document is a Sanity document with an _id
 * @param doc - The document to check
 * @returns True if the document is a Sanity document with an _id, false otherwise
 *
 * @internal
 */
export function isIdentifiedSanityDocument(doc: unknown): doc is IdentifiedSanityDocumentStub {
  return isSanityDocumentish(doc) && '_id' in doc
}

import {randomUUID} from 'node:crypto'

import {type PatchOperations, type SanityClient} from '@sanity/client'
import {of} from 'rxjs'

/**
 * A very naive mock Sanity Client implementation that caters to this exact use case.
 */
export function createMockClient(): {
  client: SanityClient
  transactions: Record<string, {documentId: string; operation: PatchOperations}[]>
} {
  const transactions: Record<string, {documentId: string; operation: PatchOperations}[]> = {}

  const mockClient = {
    observable: {
      transaction() {
        const transactionId = randomUUID()
        const operations: {documentId: string; operation: PatchOperations}[] = []
        transactions[transactionId] = operations

        return {
          commit: () => of([]),
          patch(documentId: string, operation: PatchOperations) {
            operations.push({documentId, operation})
            return this
          },
        }
      },
    },
  } as unknown as SanityClient

  return {
    client: mockClient,
    transactions,
  }
}

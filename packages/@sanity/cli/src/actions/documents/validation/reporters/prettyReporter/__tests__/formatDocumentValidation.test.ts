import {describe, expect, it, vi} from 'vitest'

import {formatDocumentValidation} from '../formatDocumentValidation'

// disables some terminal specific things that are typically auto detected
vi.mock(import('node:tty'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isatty: () => false,
  }
})

describe('formatDocumentValidation', () => {
  it('formats a set of markers in to a printed tree, sorting markers, and adding spacing', () => {
    const result = formatDocumentValidation({
      documentId: 'my-document-id',
      documentType: 'person',
      level: 'error',
      markers: [
        {level: 'error', message: 'Top-level marker', path: []},
        {level: 'error', message: '2nd top-level marker', path: []},
        {level: 'error', message: 'Property marker', path: ['foo']},
        {level: 'error', message: 'Nested marker', path: ['bar', 'title']},
        {level: 'error', message: '2nd nested marker', path: ['bar', 'title']},
        {level: 'error', message: '2nd property marker', path: ['baz']},
        {level: 'warning', message: 'Warning', path: ['beep', 'boop']},
        {level: 'error', message: 'Errors sorted first', path: ['beep', 'boop']},
      ],
      revision: 'rev',
    })

    expect(result).toMatchInlineSnapshot(
      `
      "[ERROR] [person] my-document-id
      │  (root) ........................ [31m✖[39m Top-level marker
      │                                  [31m✖[39m 2nd top-level marker
      ├─ foo ........................... [31m✖[39m Property marker
      ├─ bar
      │ └─ title ....................... [31m✖[39m Nested marker
      │                                  [31m✖[39m 2nd nested marker
      ├─ baz ........................... [31m✖[39m 2nd property marker
      └─ beep
        └─ boop ........................ [31m✖[39m Errors sorted first
                                         [33m⚠[39m Warning"
    `,
    )
  })

  it('formats a set of top-level markers only (should have an elbow at first message)', () => {
    const result = formatDocumentValidation({
      documentId: 'my-document-id',
      documentType: 'person',
      level: 'error',
      markers: [
        {level: 'info', message: '2nd top-level marker (should come last)', path: []},
        {level: 'error', message: 'Lone top-level marker (should get elbow)', path: []},
        {level: 'warning', message: 'Warning, should come second', path: []},
      ],
      revision: 'rev',
    })

    expect(result).toMatchInlineSnapshot(
      `
      "[ERROR] [person] my-document-id
      └─ (root) ........................ [31m✖[39m Lone top-level marker (should get elbow)
                                         [33m⚠[39m Warning, should come second
                                         [34mℹ[39m 2nd top-level marker (should come last)"
    `,
    )
  })
})

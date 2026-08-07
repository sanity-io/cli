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

// Keep snapshots stable regardless of terminal color support.
vi.mock(import('@sanity/cli-core/ux'), () => ({
  logSymbols: {error: '✖', info: 'ℹ', success: '✔', warning: '⚠'},
}))

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
      │  (root) ........................ ✖ Top-level marker
      │                                  ✖ 2nd top-level marker
      ├─ foo ........................... ✖ Property marker
      ├─ bar
      │ └─ title ....................... ✖ Nested marker
      │                                  ✖ 2nd nested marker
      ├─ baz ........................... ✖ 2nd property marker
      └─ beep
        └─ boop ........................ ✖ Errors sorted first
                                         ⚠ Warning"
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
      └─ (root) ........................ ✖ Lone top-level marker (should get elbow)
                                         ⚠ Warning, should come second
                                         ℹ 2nd top-level marker (should come last)"
    `,
    )
  })
})

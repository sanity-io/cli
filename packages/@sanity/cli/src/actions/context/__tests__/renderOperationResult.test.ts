import {stripVTControlCharacters} from 'node:util'

import {describe, expect, test} from 'vitest'

import {renderOperationResult} from '../renderOperationResult.js'

const render = (result: unknown, columns?: readonly string[]) =>
  stripVTControlCharacters(renderOperationResult(result, {columns, summary: 'Delete a source'}))

describe('renderOperationResult', () => {
  test('an object as key-value lines, nested values as JSON and nothing as a dash', () => {
    const output = render({
      crawlOptions: {maxDepth: 2},
      id: 'src1',
      latestSync: null,
      openIssueCount: 3,
    })
    expect(output.split('\n')).toEqual([
      '  Crawl options:    {"maxDepth":2}',
      '  ID:               src1',
      '  Latest sync:      -',
      '  Open issue count: 3',
    ])
  })

  test('a list as a table of the given columns', () => {
    const output = render(
      [
        {id: 'src1', title: 'Docs', type: 'web'},
        {id: 'src2', title: 'Handbook', type: 'files'},
      ],
      ['id', 'title'],
    )
    expect(output).toContain('ID')
    expect(output).toContain('Title')
    expect(output).toContain('Handbook')
    expect(output).not.toContain('Type')
  })

  test("a list without columns shows each item's first scalar fields", () => {
    const output = render([{chunks: [1, 2], id: 'd1', state: 'active'}])
    expect(output).toContain('State')
    expect(output).not.toContain('Chunks')
  })

  test('an empty list, text, and no content', () => {
    expect(render([])).toBe('No results')
    expect(render('# Initial context')).toBe('# Initial context')
    expect(render(undefined)).toBe('Delete a source: done')
  })
})

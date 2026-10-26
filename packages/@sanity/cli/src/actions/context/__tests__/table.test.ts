import {afterEach, describe, expect, test, vi} from 'vitest'

import {contextTable} from '../table.js'

function render(): string {
  return contextTable({columns: [{alignment: 'left', name: 'id', title: 'ID'}]})
    .addRow({id: 'source-def456'})
    .render()
}

describe('contextTable', () => {
  const {hasColors, isTTY} = process.stdout

  afterEach(() => {
    process.stdout.isTTY = isTTY
    process.stdout.hasColors = hasColors
  })

  test('leaves out colours when stdout is not a terminal', () => {
    process.stdout.isTTY = false

    expect(render()).toContain('source-def456')
    expect(render()).not.toContain('\u001B[')
  })

  test('leaves out colours when the terminal has none, as with NO_COLOR', () => {
    process.stdout.isTTY = true
    process.stdout.hasColors = vi.fn().mockReturnValue(false)

    expect(render()).not.toContain('\u001B[')
  })

  test('keeps colours on a terminal that has them', () => {
    process.stdout.isTTY = true
    process.stdout.hasColors = vi.fn().mockReturnValue(true)

    expect(render()).toContain('\u001B[')
  })
})

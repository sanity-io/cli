import stringWidth from 'string-width'
import {afterEach, describe, expect, test} from 'vitest'

import {Table} from '../responsiveTable.js'

describe('responsiveTable', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.stdout, 'columns')
  })

  test('uses the natural content width when no terminal width is available', () => {
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'role', title: 'Role'},
      ],
      shouldDisableColors: true,
    })

    table.addRows([
      {name: 'Ada', role: 'Administrator'},
      {name: 'Grace', role: 'Developer'},
    ])

    const output = table.render()
    expect(output).toContain('Ada')
    expect(output).toContain('Administrator')
    expect(output).toContain('Grace')
    expect(output).toContain('Developer')
    expect(output.split('\n').filter((line) => line.startsWith('├'))).toHaveLength(2)
  })

  test('wraps Unicode content within the terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 50})
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'label', title: 'Label'},
        {alignment: 'left', name: 'roles', title: 'Roles'},
        {alignment: 'left', name: 'expires', title: 'Expires'},
      ],
      shouldDisableColors: true,
      title: 'API tokens',
    })

    table.addRow({
      expires: 'Never',
      label: '日本語のとても長いトークンラベル 🎉',
      roles: 'Administrator, Editor, Viewer, Contributor',
    })

    const output = table.render()
    expect(output).toContain('日本語')
    expect(output).toContain('Administrator')
    expect(output).toContain('Contributor')
    for (const line of output.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(50)
    }
  })

  test('keeps borders intact for multi-code-point emoji', () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 20})
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'emoji', title: 'Emoji'},
        {alignment: 'left', name: 'value', title: 'Value'},
      ],
      shouldDisableColors: true,
    })

    table.addRow({emoji: '👨‍👩‍👧‍👦', value: 'Cafe'})

    const output = table.render()
    const lines = output.split('\n')
    expect(output).toContain('👨‍👩‍👧‍👦')
    expect(output).toContain('Cafe')

    // The family emoji is a ZWJ sequence that `string-width` measures as 2 columns and
    // `console-table-printer` as 8. That disagreement pushes the rendered table past the
    // width this helper estimated, which is what previously let `wrap-ansi` reflow the
    // finished output and split the horizontal rules across lines.
    //
    // The guarantee under test is that every border survives on a single line. Note that
    // the table is 20 columns wide while the helper estimated 17, so the disagreement is
    // still visible: the data row pads to the printer's 8-column reading of the emoji and
    // renders short wherever the sequence composes into a single glyph. Asserting an
    // overall width bound here would only pass by coincidence.
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe('┌──────────┬───────┐')
    expect(lines[2]).toBe('├──────────┼───────┤')
    expect(lines[4]).toBe('└──────────┴───────┘')
    expect(lines[1]).toMatch(/^│.*│$/u)
    expect(lines[3]).toMatch(/^│.*│$/u)
  })

  test('wraps column titles within the terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 40})
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'source', title: 'Source Dataset'},
        {alignment: 'left', name: 'target', title: 'Target Dataset'},
        {alignment: 'left', name: 'history', title: 'With history'},
        {alignment: 'left', name: 'started', title: 'Time started'},
      ],
      shouldDisableColors: true,
    })

    table.addRow({history: 'true', source: 'production', started: 'Today', target: 'staging'})

    const output = table.render()
    expect(output).toContain('Source')
    expect(output).toContain('Dataset')
    expect(output).toContain('Target')
    expect(output).toContain('history')
    for (const line of output.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(40)
    }
  })

  test('hard-wraps table titles to the rendered table width', () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 20})
    const table = new Table({
      columns: [
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'role', title: 'Role'},
      ],
      shouldDisableColors: true,
      title: 'averylongunbrokentabletitle',
    })

    table.addRow({name: 'Ada', role: 'Admin'})

    const output = table.render()
    const renderedTitle = output
      .split('\n')
      .slice(0, 2)
      .map((line) => line.trim())
      .join('')
    expect(renderedTitle).toBe('averylongunbrokentabletitle')
    for (const line of output.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(20)
    }
  })
})

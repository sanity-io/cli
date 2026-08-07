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

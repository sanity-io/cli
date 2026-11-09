import {PassThrough} from 'node:stream'
import {stripVTControlCharacters} from 'node:util'

import {describe, expect, test} from 'vitest'

import {type ChecklistItem, fitLabel, getLabelWidth, roleChecklist} from '../roleChecklist.js'

type Role = {title: string; value: string}

const SPACE = ' '
const RIGHT = '\u001B[C'
const LEFT = '\u001B[D'
const ENTER = '\r'

const viewer = {title: 'Viewer', value: 'viewer'}
const editor = {title: 'Editor', value: 'editor'}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

function startChecklist(items: ChecklistItem[]) {
  const input = new PassThrough()
  const output = new PassThrough()
  let screen = ''
  output.on('data', (chunk: Buffer) => {
    screen += chunk.toString()
  })
  const answer = roleChecklist(
    {message: 'Access?', sections: [{items, title: 'Projects'}]},
    {input, output},
  )

  return {
    answer,
    lastFrame: () => stripVTControlCharacters(screen).split('Access?').at(-1) ?? '',
    press: async (...keys: string[]) => {
      for (const key of keys) {
        await settle()
        input.write(key)
      }
      await settle()
    },
  }
}

function projectItem(loadRoles: () => Promise<Role[]>): ChecklistItem {
  return {loadRoles, name: 'Website', role: 'viewer', roles: [viewer], value: 'project:p1'}
}

describe('roleChecklist layout', () => {
  const items = [
    {name: 'Context', roles: [{title: 'Developer', value: 'developer'}], value: 'context'},
    {name: 'Marketing website', suffix: '(k7pq2mzd)', value: 'project:k7pq2mzd'},
    {name: 'Customer stories microsite', suffix: '(m4wh1zpe)', value: 'project:m4wh1zpe'},
  ]

  test('pads every label to the longest one so role columns align', () => {
    const width = getLabelWidth(items, 120)

    expect(width).toBe('Customer stories microsite (m4wh1zpe)'.length)
    expect(new Set(items.map((item) => fitLabel(item, width).length))).toEqual(new Set([width]))
  })

  test('shortens names to fit the terminal while keeping the suffix visible', () => {
    const width = getLabelWidth(items, 50)

    expect(width).toBe(50 - 4 - 4 - '‹ Developer ›'.length)
    expect(fitLabel(items[2], width).trimEnd()).toBe('Customer stories… (m4wh1zpe)')
  })
})

describe('roleChecklist role lookups', () => {
  test('waits for a slow lookup, then applies the role picked while it loaded', async () => {
    const roles = Promise.withResolvers<Role[]>()
    const prompt = startChecklist([projectItem(() => roles.promise)])

    await prompt.press(SPACE, RIGHT, ENTER)
    expect(prompt.lastFrame()).toContain('Still loading roles')

    roles.resolve([viewer, editor])
    await prompt.press(ENTER)

    await expect(prompt.answer).resolves.toEqual([{role: 'editor', value: 'project:p1'}])
  })

  test('applies a role change pressed in the same input chunk as enter', async () => {
    const prompt = startChecklist([
      {
        checked: true,
        name: 'Website',
        role: 'editor',
        roles: [viewer, editor],
        value: 'project:p1',
      },
    ])

    await prompt.press(LEFT + ENTER)

    await expect(prompt.answer).resolves.toEqual([{role: 'viewer', value: 'project:p1'}])
  })

  test.each([
    {
      loadRoles: () => Promise.reject(new Error('Forbidden')),
      lookup: 'failed',
      message: "Couldn't load roles for Website",
    },
    {
      loadRoles: () => Promise.resolve([]),
      lookup: 'empty',
      message: 'Website has no roles that tokens can use',
    },
  ])(
    'blocks submit after a $lookup lookup until the project is unchecked',
    async ({loadRoles, message}) => {
      const prompt = startChecklist([
        projectItem(loadRoles),
        {checked: true, name: 'Blueprints', value: 'blueprints'},
      ])

      await prompt.press(SPACE, ENTER)
      expect(prompt.lastFrame()).toContain(message)

      await prompt.press(SPACE, ENTER)
      await expect(prompt.answer).resolves.toEqual([{value: 'blueprints'}])
    },
  )
})

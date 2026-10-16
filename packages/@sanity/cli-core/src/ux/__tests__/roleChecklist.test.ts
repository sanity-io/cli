import {describe, expect, test} from 'vitest'

import {fitLabel, getLabelWidth} from '../roleChecklist.js'

const roles = [{title: 'Developer', value: 'developer'}]
const items = [
  {name: 'Context', roles, value: 'context'},
  {
    name: 'Marketing website',
    suffix: '(k7pq2mzd)',
    value: 'project:k7pq2mzd',
  },
  {
    name: 'Customer stories microsite',
    suffix: '(m4wh1zpe)',
    value: 'project:m4wh1zpe',
  },
]

describe('roleChecklist layout', () => {
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

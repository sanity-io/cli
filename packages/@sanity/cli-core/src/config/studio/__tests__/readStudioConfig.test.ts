import {describe, expect, test} from 'vitest'
import {z} from 'zod'

import {formatZodIssues} from '../readStudioConfig.js'

describe('formatZodIssues', () => {
  test('formats a simple type error', () => {
    const schema = z.object({projectId: z.string()})
    const result = schema.safeParse({projectId: 42})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')

    const output = formatZodIssues(result.error.issues)
    expect(output).toContain('projectId')
    expect(output).toContain('Invalid input')
  })

  test('includes path for nested field errors', () => {
    const schema = z.object({api: z.object({projectId: z.string()})})
    const result = schema.safeParse({api: {projectId: 42}})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')

    const output = formatZodIssues(result.error.issues)
    expect(output).toContain('api.projectId')
  })

  test('omits path suffix for root-level errors', () => {
    const schema = z.string()
    const result = schema.safeParse(42)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')

    const output = formatZodIssues(result.error.issues)
    expect(output).not.toContain(' at "')
  })

  test('recurses into union errors', () => {
    const schema = z.union([z.object({type: z.literal('a')}), z.object({type: z.literal('b')})])
    const result = schema.safeParse({type: 'c'})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')

    const output = formatZodIssues(result.error.issues)
    expect(output).toContain('Union option 1')
    expect(output).toContain('Union option 2')
  })

  test('indents nested union errors', () => {
    const schema = z.union([z.object({type: z.literal('a')}), z.object({type: z.literal('b')})])
    const result = schema.safeParse({type: 'c'})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')

    const output = formatZodIssues(result.error.issues, 2)
    const lines = output.split('\n')
    const unionLine = lines.find((l) => l.includes('Union option 1'))
    const detailLine = lines.find((l) => l.includes('- ') && !l.includes('Union option'))

    expect(unionLine).toBeDefined()
    expect(detailLine).toBeDefined()
    // Detail line should be indented more than the union header
    expect(detailLine!.indexOf('-')).toBeGreaterThan(unionLine!.indexOf('U'))
  })
})

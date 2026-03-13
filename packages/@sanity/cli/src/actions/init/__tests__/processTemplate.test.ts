import {describe, expect, test} from 'vitest'

import {processTemplate} from '../processTemplate.js'

describe('processTemplate', () => {
  test('replaces string placeholders with single quotes', () => {
    const result = processTemplate({
      template: `const id = '%projectId%'`,
      variables: {projectId: 'abc123'},
    })
    expect(result).toBe(`const id = 'abc123'`)
  })

  test('replaces string placeholders with double quotes', () => {
    const result = processTemplate({
      template: `const id = "%projectId%"`,
      variables: {projectId: 'abc123'},
    })
    expect(result).toBe(`const id = "abc123"`)
  })

  test('replaces multiple string placeholders', () => {
    const result = processTemplate({
      template: `const config = { projectId: '%projectId%', dataset: '%dataset%' }`,
      variables: {dataset: 'production', projectId: 'abc123'},
    })
    expect(result).toContain(`projectId: 'abc123'`)
    expect(result).toContain(`dataset: 'production'`)
  })

  test('replaces boolean placeholders when includeBooleanTransform is true', () => {
    const result = processTemplate({
      includeBooleanTransform: true,
      template: `const config = { autoUpdates: __BOOL__autoUpdates__ }`,
      variables: {autoUpdates: true},
    })
    expect(result).toContain('autoUpdates: true')
  })

  test('replaces boolean false values', () => {
    const result = processTemplate({
      includeBooleanTransform: true,
      template: `const config = { autoUpdates: __BOOL__autoUpdates__ }`,
      variables: {autoUpdates: false},
    })
    expect(result).toContain('autoUpdates: false')
  })

  test('handles boolean variable names containing underscores', () => {
    const result = processTemplate({
      includeBooleanTransform: true,
      template: `const config = { autoUpdates: __BOOL__auto_updates__ }`,
      variables: {auto_updates: true},
    })
    expect(result).toContain('autoUpdates: true')
    expect(result).not.toContain('__BOOL__')
  })

  test('does not replace boolean placeholders when includeBooleanTransform is false', () => {
    const result = processTemplate({
      template: `const config = { autoUpdates: __BOOL__autoUpdates__ }`,
      variables: {autoUpdates: true},
    })
    expect(result).toContain('__BOOL__autoUpdates__')
  })

  test('escapes single quotes in values within single-quoted strings', () => {
    const result = processTemplate({
      template: `const name = '%projectName%'`,
      variables: {projectName: "John's Studio"},
    })
    expect(result).toBe(`const name = 'John\\'s Studio'`)
  })

  test('escapes double quotes in values within double-quoted strings', () => {
    const result = processTemplate({
      template: `const name = "%projectName%"`,
      variables: {projectName: 'My "Cool" Project'},
    })
    expect(result).toBe(`const name = "My \\"Cool\\" Project"`)
  })

  test('escapes backslashes in values', () => {
    const result = processTemplate({
      template: `const path = '%entry%'`,
      variables: {entry: 'src\\app\\main'},
    })
    expect(result).toBe(`const path = 'src\\\\app\\\\main'`)
  })

  test('replaces non-string values with empty string', () => {
    const result = processTemplate({
      template: `const id = '%projectId%'`,
      variables: {projectId: 42 as unknown as string},
    })
    expect(result).toBe(`const id = ''`)
  })

  test('trims leading whitespace from template', () => {
    const result = processTemplate({
      template: `\n\n  const id = '%projectId%'`,
      variables: {projectId: 'abc'},
    })
    expect(result).toMatch(/^\s*const/)
    expect(result).not.toMatch(/^\n\n/)
  })

  test('throws on undefined string variable', () => {
    expect(() =>
      processTemplate({
        template: `const id = '%missing%'`,
        variables: {},
      }),
    ).toThrow("Template variable '%missing%' not defined")
  })

  test('throws on undefined boolean variable', () => {
    expect(() =>
      processTemplate({
        includeBooleanTransform: true,
        template: `const x = __BOOL__missing__`,
        variables: {},
      }),
    ).toThrow("Template variable 'missing' not defined")
  })

  test('throws when boolean variable is not a boolean', () => {
    expect(() =>
      processTemplate({
        includeBooleanTransform: true,
        template: `const x = __BOOL__value__`,
        variables: {value: 'not-a-boolean'},
      }),
    ).toThrow("Expected boolean value for 'value'")
  })

  test('handles a realistic CLI config template', () => {
    const template = `
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '%projectId%',
    dataset: '%dataset%'
  },
  deployment: {
    autoUpdates: __BOOL__autoUpdates__,
  }
})
`
    const result = processTemplate({
      includeBooleanTransform: true,
      template,
      variables: {
        autoUpdates: true,
        dataset: 'production',
        projectId: 'xyz789',
      },
    })
    expect(result).toContain(`projectId: 'xyz789'`)
    expect(result).toContain(`dataset: 'production'`)
    expect(result).toContain('autoUpdates: true')
    expect(result).not.toContain('%')
    expect(result).not.toContain('__BOOL__')
  })

  test('handles a realistic studio config template', () => {
    const template = `
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: '%sourceName%',
  title: '%projectName%',

  projectId: '%projectId%',
  dataset: '%dataset%',

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
`
    const result = processTemplate({
      template,
      variables: {
        dataset: 'staging',
        projectId: 'test123',
        projectName: 'My Studio',
        sourceName: 'default',
      },
    })
    expect(result).toContain(`name: 'default'`)
    expect(result).toContain(`title: 'My Studio'`)
    expect(result).toContain(`projectId: 'test123'`)
    expect(result).toContain(`dataset: 'staging'`)
  })
})

import {afterEach, describe, expect, test, vi} from 'vitest'

import {selectTemplate, templateChoices} from '../scaffoldTemplate.js'
import {type InitOptions} from '../types.js'

const mockPromptForTypeScript = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/init/promptForTypescript.js', () => ({
  promptForTypeScript: mockPromptForTypeScript,
}))

function initOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    autoUpdates: true,
    bare: false,
    datasetDefault: false,
    fromCreate: false,
    mcpMode: 'skip',
    skillsMode: 'skip',
    unattended: true,
    ...overrides,
  }
}

describe('templateChoices', () => {
  test('offers the page-builder template', () => {
    const values = templateChoices.map((choice) => choice.value)
    expect(values).toContain('page-builder')
  })
})

describe('selectTemplate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('forces TypeScript for shopify when --no-typescript is passed', async () => {
    const result = await selectTemplate({
      options: initOptions({template: 'shopify', typescript: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('shopify')
    expect(result.useTypeScript).toBe(true)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })

  test('does not prompt for TypeScript when shopify is selected interactively', async () => {
    mockPromptForTypeScript.mockResolvedValueOnce(false)

    const result = await selectTemplate({
      options: initOptions({template: 'shopify', typescript: undefined, unattended: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('shopify')
    expect(result.useTypeScript).toBe(true)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })

  test('still honours --no-typescript for JavaScript-authored templates', async () => {
    const result = await selectTemplate({
      options: initOptions({template: 'clean', typescript: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('clean')
    expect(result.useTypeScript).toBe(false)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })
})

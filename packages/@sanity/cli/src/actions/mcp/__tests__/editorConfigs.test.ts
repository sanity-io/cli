import {describe, expect, test} from 'vitest'

import {EDITOR_CONFIGS} from '../editorConfigs.js'

describe('readToken', () => {
  const validServerConfig = {
    headers: {Authorization: 'Bearer my-secret-token'},
    type: 'http',
    url: 'https://mcp.sanity.io',
  }

  test('extracts Bearer token from headers.Authorization', () => {
    const token = EDITOR_CONFIGS['Claude Code'].readToken(validServerConfig)
    expect(token).toBe('my-secret-token')
  })

  test('extracts Bearer token from http_headers.Authorization (Codex CLI)', () => {
    const codexConfig = {
      http_headers: {Authorization: 'Bearer codex-token-123'},
      type: 'http',
      url: 'https://mcp.sanity.io',
    }
    const token = EDITOR_CONFIGS['Codex CLI'].readToken(codexConfig)
    expect(token).toBe('codex-token-123')
  })

  test('returns undefined when headers is missing', () => {
    const config = {type: 'http', url: 'https://mcp.sanity.io'}
    const token = EDITOR_CONFIGS.Cursor.readToken(config)
    expect(token).toBeUndefined()
  })

  test('returns undefined when Authorization header is missing', () => {
    const config = {headers: {}, type: 'http', url: 'https://mcp.sanity.io'}
    const token = EDITOR_CONFIGS.Cursor.readToken(config)
    expect(token).toBeUndefined()
  })

  test('returns undefined for non-Bearer auth schemes', () => {
    const config = {
      headers: {Authorization: 'Basic dXNlcjpwYXNz'},
      type: 'http',
      url: 'https://mcp.sanity.io',
    }
    const token = EDITOR_CONFIGS['Claude Code'].readToken(config)
    expect(token).toBeUndefined()
  })

  test('returns undefined when headers is not an object', () => {
    const config = {headers: 'not-an-object', type: 'http'}
    const token = EDITOR_CONFIGS['VS Code'].readToken(config)
    expect(token).toBeUndefined()
  })

  test('all editors with headers-based auth extract tokens consistently', () => {
    const headersEditors = [
      'Claude Code',
      'Cursor',
      'Gemini CLI',
      'GitHub Copilot CLI',
      'OpenCode',
      'VS Code',
      'VS Code Insiders',
      'Zed',
    ] as const

    for (const name of headersEditors) {
      const token = EDITOR_CONFIGS[name].readToken(validServerConfig)
      expect(token, `${name} should extract token from headers`).toBe('my-secret-token')
    }
  })

  test('Codex CLI does NOT extract from headers (uses http_headers)', () => {
    const token = EDITOR_CONFIGS['Codex CLI'].readToken(validServerConfig)
    expect(token).toBeUndefined()
  })
})

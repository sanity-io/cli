import path from 'node:path'

import {describe, expect, test} from 'vitest'

import {type DetectionEnv, EDITOR_CONFIGS, getVSCodeUserDir} from '../editorConfigs.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an isolated DetectionEnv with safe defaults (nothing detected). */
function createMockEnv(overrides?: Partial<DetectionEnv>): DetectionEnv {
  return {
    env: {},
    execCommand: () => Promise.reject(new Error('not installed')),
    existsSync: () => false,
    homedir: '/home/testuser',
    platform: 'darwin',
    ...overrides,
  }
}

/** Returns an existsSync mock that matches any of the given path suffixes. */
function existsForSuffixes(...suffixes: string[]): (p: string) => boolean {
  return (p: string) => suffixes.some((s) => p.endsWith(s))
}

// ---------------------------------------------------------------------------
// readToken (existing tests, kept as-is)
// ---------------------------------------------------------------------------

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
      'Antigravity',
      'Claude Code',
      'Cline',
      'Cline CLI',
      'Cursor',
      'Gemini CLI',
      'GitHub Copilot CLI',
      'MCPorter',
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

// ---------------------------------------------------------------------------
// getVSCodeUserDir
// ---------------------------------------------------------------------------

describe('getVSCodeUserDir', () => {
  test('returns macOS path for stable', () => {
    const ctx = createMockEnv({platform: 'darwin'})
    expect(getVSCodeUserDir(ctx)).toBe(
      path.join('/home/testuser', 'Library/Application Support/Code/User'),
    )
  })

  test('returns macOS path for insiders', () => {
    const ctx = createMockEnv({platform: 'darwin'})
    expect(getVSCodeUserDir(ctx, 'insiders')).toBe(
      path.join('/home/testuser', 'Library/Application Support/Code - Insiders/User'),
    )
  })

  test('returns Windows path using APPDATA', () => {
    const ctx = createMockEnv({
      env: {APPDATA: 'C:\\Users\\test\\AppData\\Roaming'},
      platform: 'win32',
    })
    expect(getVSCodeUserDir(ctx)).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'Code/User'))
  })

  test('returns null on Windows without APPDATA', () => {
    const ctx = createMockEnv({platform: 'win32'})
    expect(getVSCodeUserDir(ctx)).toBeNull()
  })

  test('returns Linux path for stable', () => {
    const ctx = createMockEnv({platform: 'linux'})
    expect(getVSCodeUserDir(ctx)).toBe(path.join('/home/testuser', '.config/Code/User'))
  })

  test('returns Linux path for insiders', () => {
    const ctx = createMockEnv({platform: 'linux'})
    expect(getVSCodeUserDir(ctx, 'insiders')).toBe(
      path.join('/home/testuser', '.config/Code - Insiders/User'),
    )
  })
})

// ---------------------------------------------------------------------------
// detect functions — each tested with its own isolated DetectionEnv
// ---------------------------------------------------------------------------

describe('detect', () => {
  // -- Directory-based editors --

  describe('Cursor', () => {
    test('returns config path when .cursor dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.cursor')})
      const result = await EDITOR_CONFIGS.Cursor.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.cursor/mcp.json'))
    })

    test('returns null when .cursor dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.Cursor.detect(ctx)).toBeNull()
    })
  })

  describe('Antigravity', () => {
    test('returns config path when .gemini/antigravity dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/antigravity')})
      const result = await EDITOR_CONFIGS.Antigravity.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.gemini/antigravity/mcp_config.json'))
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.Antigravity.detect(ctx)).toBeNull()
    })
  })

  describe('Gemini CLI', () => {
    test('returns settings.json when it exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/settings.json')})
      const result = await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.gemini/settings.json'))
    })

    test('returns null when settings.json does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)).toBeNull()
    })

    test('does NOT detect when only antigravity subdir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/antigravity')})
      expect(await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)).toBeNull()
    })
  })

  describe('GitHub Copilot CLI', () => {
    test('returns config path when .copilot dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.copilot')})
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.copilot/mcp-config.json'))
    })

    test('uses XDG_CONFIG_HOME on Linux', async () => {
      const ctx = createMockEnv({
        env: {XDG_CONFIG_HOME: '/custom/config'},
        existsSync: existsForSuffixes('config/copilot'),
        platform: 'linux',
      })
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expect(result).toBe(path.join('/custom/config', 'copilot/mcp-config.json'))
    })

    test('ignores XDG_CONFIG_HOME on non-Linux', async () => {
      const ctx = createMockEnv({
        env: {XDG_CONFIG_HOME: '/custom/config'},
        existsSync: existsForSuffixes('.copilot'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.copilot/mcp-config.json'))
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)).toBeNull()
    })
  })

  // -- VS Code family --

  describe('VS Code', () => {
    test('returns config path on macOS when dir exists', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('Code/User'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS['VS Code'].detect(ctx)
      expect(result).toBe(
        path.join('/home/testuser', 'Library/Application Support/Code/User/mcp.json'),
      )
    })

    test('returns config path on Linux when dir exists', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('Code/User'),
        platform: 'linux',
      })
      const result = await EDITOR_CONFIGS['VS Code'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.config/Code/User/mcp.json'))
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['VS Code'].detect(ctx)).toBeNull()
    })

    test('returns null on Windows without APPDATA', async () => {
      const ctx = createMockEnv({platform: 'win32'})
      expect(await EDITOR_CONFIGS['VS Code'].detect(ctx)).toBeNull()
    })
  })

  describe('VS Code Insiders', () => {
    test('returns config path on macOS when dir exists', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('Code - Insiders/User'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS['VS Code Insiders'].detect(ctx)
      expect(result).toBe(
        path.join('/home/testuser', 'Library/Application Support/Code - Insiders/User/mcp.json'),
      )
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['VS Code Insiders'].detect(ctx)).toBeNull()
    })
  })

  // -- Cline (VS Code extension) — the key isolation test --

  describe('Cline', () => {
    test('returns config path when Cline extension dir exists inside VS Code', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('globalStorage/saoudrizwan.claude-dev/settings'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS.Cline.detect(ctx)
      expect(result).toContain('cline_mcp_settings.json')
    })

    test('returns null when only VS Code dir exists (Cline not installed)', async () => {
      // This is the exact collision case that previously broke the integration test.
      // Only the VS Code User dir exists, not the nested Cline extension dir.
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('Code/User'),
        platform: 'darwin',
      })
      expect(await EDITOR_CONFIGS.Cline.detect(ctx)).toBeNull()
    })

    test('returns null on Windows without APPDATA', async () => {
      const ctx = createMockEnv({platform: 'win32'})
      expect(await EDITOR_CONFIGS.Cline.detect(ctx)).toBeNull()
    })
  })

  // -- Cline CLI --

  describe('Cline CLI', () => {
    test('returns config path when .cline dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.cline')})
      const result = await EDITOR_CONFIGS['Cline CLI'].detect(ctx)
      expect(result).toBe(
        path.join('/home/testuser', '.cline/data/settings/cline_mcp_settings.json'),
      )
    })

    test('uses CLINE_DIR env var when set', async () => {
      const ctx = createMockEnv({
        env: {CLINE_DIR: '/custom/cline'},
        existsSync: existsForSuffixes('/custom/cline'),
      })
      const result = await EDITOR_CONFIGS['Cline CLI'].detect(ctx)
      expect(result).toBe(path.join('/custom/cline', 'data/settings/cline_mcp_settings.json'))
    })

    test('returns null when .cline dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['Cline CLI'].detect(ctx)).toBeNull()
    })
  })

  // -- CLI-based editors --

  describe('Claude Code', () => {
    test('returns config path when CLI is available', async () => {
      const ctx = createMockEnv({execCommand: () => Promise.resolve()})
      const result = await EDITOR_CONFIGS['Claude Code'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.claude.json'))
    })

    test('returns null when CLI is not installed', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['Claude Code'].detect(ctx)).toBeNull()
    })
  })

  describe('Codex CLI', () => {
    test('returns config path when CLI is available', async () => {
      const ctx = createMockEnv({execCommand: () => Promise.resolve()})
      const result = await EDITOR_CONFIGS['Codex CLI'].detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.codex/config.toml'))
    })

    test('uses CODEX_HOME env var when set', async () => {
      const ctx = createMockEnv({
        env: {CODEX_HOME: '/custom/codex'},
        execCommand: () => Promise.resolve(),
      })
      const result = await EDITOR_CONFIGS['Codex CLI'].detect(ctx)
      expect(result).toBe(path.join('/custom/codex', 'config.toml'))
    })

    test('returns null when CLI is not installed', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['Codex CLI'].detect(ctx)).toBeNull()
    })
  })

  describe('OpenCode', () => {
    test('returns config path when CLI is available', async () => {
      const ctx = createMockEnv({execCommand: () => Promise.resolve()})
      const result = await EDITOR_CONFIGS.OpenCode.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.config/opencode/opencode.json'))
    })

    test('returns null when CLI is not installed', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.OpenCode.detect(ctx)).toBeNull()
    })
  })

  // -- Zed --

  describe('Zed', () => {
    test('returns config path on macOS when dir exists', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('.config/zed'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS.Zed.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.config/zed/settings.json'))
    })

    test('returns config path on Windows using APPDATA', async () => {
      const ctx = createMockEnv({
        env: {APPDATA: 'C:\\Users\\test\\AppData\\Roaming'},
        existsSync: existsForSuffixes('Zed'),
        platform: 'win32',
      })
      const result = await EDITOR_CONFIGS.Zed.detect(ctx)
      expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'Zed/settings.json'))
    })

    test('returns null on Windows without APPDATA', async () => {
      const ctx = createMockEnv({platform: 'win32'})
      expect(await EDITOR_CONFIGS.Zed.detect(ctx)).toBeNull()
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.Zed.detect(ctx)).toBeNull()
    })
  })

  // -- MCPorter --

  describe('MCPorter', () => {
    test('returns .json path when both dir and .json exist', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('.mcporter', '.mcporter/mcporter.json'),
      })
      const result = await EDITOR_CONFIGS.MCPorter.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.mcporter/mcporter.json'))
    })

    test('returns .jsonc path when dir and .jsonc exist but .json does not', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('.mcporter', '.mcporter/mcporter.jsonc'),
      })
      const result = await EDITOR_CONFIGS.MCPorter.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.mcporter/mcporter.jsonc'))
    })

    test('falls back to .json path when dir exists but neither file does', async () => {
      const ctx = createMockEnv({
        existsSync: (p: string) => {
          if (p.endsWith('.mcporter/mcporter.json')) return false
          if (p.endsWith('.mcporter/mcporter.jsonc')) return false
          return p.endsWith('.mcporter')
        },
      })
      const result = await EDITOR_CONFIGS.MCPorter.detect(ctx)
      expect(result).toBe(path.join('/home/testuser', '.mcporter/mcporter.json'))
    })

    test('returns null when .mcporter dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.MCPorter.detect(ctx)).toBeNull()
    })
  })
})

import path from 'node:path'

import {describe, expect, test} from 'vitest'

import {
  type DetectionEnv,
  EDITOR_CONFIGS,
  type EditorName,
  getVSCodeUserDir,
  hasLegacyToken,
} from '../editorConfigs.js'

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

/** Normalize a path to forward slashes for cross-platform comparison. */
function normalize(p: string): string {
  return p.replaceAll('\\', '/')
}

/** Assert that a detected path ends with the expected suffix (cross-platform). */
function expectPath(actual: string | null, expectedSuffix: string): void {
  expect(actual).not.toBeNull()
  expect(normalize(actual!)).toContain(expectedSuffix)
}

/** Returns an existsSync mock that matches any of the given path suffixes (cross-platform). */
function existsForSuffixes(...suffixes: string[]): (p: string) => boolean {
  return (p: string) => suffixes.some((s) => normalize(p).endsWith(s))
}

// ---------------------------------------------------------------------------
// buildServerConfig
// ---------------------------------------------------------------------------

describe('buildServerConfig', () => {
  const expectedConfigs: Record<EditorName, Record<string, unknown>> = {
    Antigravity: {serverUrl: 'https://mcp.sanity.io'},
    'Claude Code': {type: 'http', url: 'https://mcp.sanity.io'},
    Cline: {disabled: false, type: 'streamableHttp', url: 'https://mcp.sanity.io'},
    'Codex CLI': {type: 'http', url: 'https://mcp.sanity.io'},
    Cursor: {type: 'http', url: 'https://mcp.sanity.io'},
    'Gemini CLI': {oauth: {enabled: true}, type: 'http', url: 'https://mcp.sanity.io'},
    'GitHub Copilot CLI': {tools: ['*'], type: 'http', url: 'https://mcp.sanity.io'},
    MCPorter: {auth: 'oauth', type: 'http', url: 'https://mcp.sanity.io'},
    OpenCode: {type: 'remote', url: 'https://mcp.sanity.io'},
    'VS Code': {type: 'http', url: 'https://mcp.sanity.io'},
    'VS Code Insiders': {type: 'http', url: 'https://mcp.sanity.io'},
    Zed: {enabled: true, url: 'https://mcp.sanity.io'},
  }

  test.each(Object.entries(expectedConfigs))(
    '%s config points at the OAuth server',
    (name, expected) => {
      expect(EDITOR_CONFIGS[name as EditorName].buildServerConfig()).toStrictEqual(expected)
    },
  )

  test('no editor config contains credentials', () => {
    for (const name of Object.keys(EDITOR_CONFIGS) as EditorName[]) {
      const config = EDITOR_CONFIGS[name].buildServerConfig()
      expect(hasLegacyToken(config), `${name} config should not contain a token`).toBe(false)
      expect(JSON.stringify(config), `${name} config should not mention Bearer`).not.toContain(
        'Bearer',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// hasLegacyToken
// ---------------------------------------------------------------------------

describe('hasLegacyToken', () => {
  test('detects a Bearer token in headers', () => {
    expect(
      hasLegacyToken({
        headers: {Authorization: 'Bearer my-secret-token'},
        type: 'http',
        url: 'https://mcp.sanity.io',
      }),
    ).toBe(true)
  })

  test('detects a Bearer token in http_headers (Codex CLI)', () => {
    expect(
      hasLegacyToken({
        http_headers: {Authorization: 'Bearer codex-token-123'},
        type: 'http',
        url: 'https://mcp.sanity.io',
      }),
    ).toBe(true)
  })

  test('detects other Authorization schemes too', () => {
    expect(hasLegacyToken({headers: {Authorization: 'Basic dXNlcjpwYXNz'}})).toBe(true)
  })

  test('returns false when headers is missing', () => {
    expect(hasLegacyToken({type: 'http', url: 'https://mcp.sanity.io'})).toBe(false)
  })

  test('returns false when the Authorization header is missing', () => {
    expect(hasLegacyToken({headers: {}, type: 'http'})).toBe(false)
  })

  test('returns false when headers is not an object', () => {
    expect(hasLegacyToken({headers: 'not-an-object', type: 'http'})).toBe(false)
    expect(hasLegacyToken({headers: null, type: 'http'})).toBe(false)
  })

  test('ignores OAuth state stored by the client', () => {
    // Cline keeps its OAuth tokens inside the server entry under `oauth`
    expect(
      hasLegacyToken({
        disabled: false,
        oauth: {accessToken: 'client-managed'},
        type: 'streamableHttp',
        url: 'https://mcp.sanity.io',
      }),
    ).toBe(false)
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
      expectPath(result, '.cursor/mcp.json')
    })

    test('returns null when .cursor dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.Cursor.detect(ctx)).toBeNull()
    })
  })

  describe('Antigravity', () => {
    test('returns config path when .gemini/config dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/config')})
      const result = await EDITOR_CONFIGS.Antigravity.detect(ctx)
      expectPath(result, '.gemini/config/mcp_config.json')
    })

    test('ignores the legacy .gemini/antigravity dir', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/antigravity')})
      expect(await EDITOR_CONFIGS.Antigravity.detect(ctx)).toBeNull()
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
      expectPath(result, '.gemini/settings.json')
    })

    test('returns null when settings.json does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)).toBeNull()
    })

    test('does NOT detect when only antigravity subdir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/antigravity')})
      expect(await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)).toBeNull()
    })

    test('does NOT detect when only the Antigravity config dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.gemini/config')})
      expect(await EDITOR_CONFIGS['Gemini CLI'].detect(ctx)).toBeNull()
    })
  })

  describe('GitHub Copilot CLI', () => {
    test('returns config path when .copilot dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.copilot')})
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expectPath(result, '.copilot/mcp-config.json')
    })

    test('uses XDG_CONFIG_HOME on Linux', async () => {
      const ctx = createMockEnv({
        env: {XDG_CONFIG_HOME: '/custom/config'},
        existsSync: existsForSuffixes('config/copilot'),
        platform: 'linux',
      })
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expectPath(result, 'copilot/mcp-config.json')
    })

    test('ignores XDG_CONFIG_HOME on non-Linux', async () => {
      const ctx = createMockEnv({
        env: {XDG_CONFIG_HOME: '/custom/config'},
        existsSync: existsForSuffixes('.copilot'),
        platform: 'darwin',
      })
      const result = await EDITOR_CONFIGS['GitHub Copilot CLI'].detect(ctx)
      expectPath(result, '.copilot/mcp-config.json')
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
      expectPath(result, 'Library/Application Support/Code/User/mcp.json')
    })

    test('returns config path on Linux when dir exists', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('Code/User'),
        platform: 'linux',
      })
      const result = await EDITOR_CONFIGS['VS Code'].detect(ctx)
      expectPath(result, '.config/Code/User/mcp.json')
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
      expectPath(result, 'Library/Application Support/Code - Insiders/User/mcp.json')
    })

    test('returns null when dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS['VS Code Insiders'].detect(ctx)).toBeNull()
    })
  })

  // -- Cline (VS Code extension and CLI share one settings file) --

  describe('Cline', () => {
    test('returns config path when .cline dir exists', async () => {
      const ctx = createMockEnv({existsSync: existsForSuffixes('.cline')})
      const result = await EDITOR_CONFIGS.Cline.detect(ctx)
      expectPath(result, '.cline/data/settings/cline_mcp_settings.json')
    })

    test('uses CLINE_DIR env var when set', async () => {
      const ctx = createMockEnv({
        env: {CLINE_DIR: '/custom/cline'},
        existsSync: existsForSuffixes('/custom/cline'),
      })
      const result = await EDITOR_CONFIGS.Cline.detect(ctx)
      expectPath(result, 'custom/cline/data/settings/cline_mcp_settings.json')
    })

    test('ignores the legacy VS Code extension storage dir', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('globalStorage/saoudrizwan.claude-dev/settings', 'Code/User'),
        platform: 'darwin',
      })
      expect(await EDITOR_CONFIGS.Cline.detect(ctx)).toBeNull()
    })

    test('returns null when .cline dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.Cline.detect(ctx)).toBeNull()
    })
  })

  // -- CLI-based editors --

  describe('Claude Code', () => {
    test('returns config path when CLI is available', async () => {
      const ctx = createMockEnv({execCommand: () => Promise.resolve()})
      const result = await EDITOR_CONFIGS['Claude Code'].detect(ctx)
      expectPath(result, '.claude.json')
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
      expectPath(result, '.codex/config.toml')
    })

    test('uses CODEX_HOME env var when set', async () => {
      const ctx = createMockEnv({
        env: {CODEX_HOME: '/custom/codex'},
        execCommand: () => Promise.resolve(),
      })
      const result = await EDITOR_CONFIGS['Codex CLI'].detect(ctx)
      expectPath(result, 'custom/codex/config.toml')
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
      expectPath(result, '.config/opencode/opencode.json')
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
      expectPath(result, '.config/zed/settings.json')
    })

    test('returns config path on Windows using APPDATA', async () => {
      const ctx = createMockEnv({
        env: {APPDATA: 'C:\\Users\\test\\AppData\\Roaming'},
        existsSync: existsForSuffixes('Zed'),
        platform: 'win32',
      })
      const result = await EDITOR_CONFIGS.Zed.detect(ctx)
      expectPath(result, 'Zed/settings.json')
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
      expectPath(result, '.mcporter/mcporter.json')
    })

    test('returns .jsonc path when dir and .jsonc exist but .json does not', async () => {
      const ctx = createMockEnv({
        existsSync: existsForSuffixes('.mcporter', '.mcporter/mcporter.jsonc'),
      })
      const result = await EDITOR_CONFIGS.MCPorter.detect(ctx)
      expectPath(result, '.mcporter/mcporter.jsonc')
    })

    test('falls back to .json path when dir exists but neither file does', async () => {
      const ctx = createMockEnv({
        existsSync: (p: string) => {
          const n = normalize(p)
          if (n.endsWith('.mcporter/mcporter.json')) return false
          if (n.endsWith('.mcporter/mcporter.jsonc')) return false
          return n.endsWith('.mcporter')
        },
      })
      const result = await EDITOR_CONFIGS.MCPorter.detect(ctx)
      expectPath(result, '.mcporter/mcporter.json')
    })

    test('returns null when .mcporter dir does not exist', async () => {
      const ctx = createMockEnv()
      expect(await EDITOR_CONFIGS.MCPorter.detect(ctx)).toBeNull()
    })
  })
})

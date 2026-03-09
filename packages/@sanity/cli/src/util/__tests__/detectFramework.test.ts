import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type Framework, frameworks} from '@vercel/frameworks'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {detectFrameworkRecord} from '../detectFramework.js'

describe('detectFrameworkRecord', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'detect-fw-'))
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, {recursive: true})
    }
  })

  test('detects Next.js from package.json dependencies', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({dependencies: {next: '14.0.0'}}))

    const result = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: tmpDir,
    })

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('nextjs')
    expect(result?.detectedVersion).toBe('14.0.0')
  })

  test('detects framework from devDependencies', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({devDependencies: {astro: '4.0.0'}}))

    const result = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: tmpDir,
    })

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('astro')
  })

  test('returns null when no framework matches', async () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {'some-unknown-package': '1.0.0'}}),
    )

    const result = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: tmpDir,
    })

    expect(result).toBeNull()
  })

  test('returns null for empty directory', async () => {
    const result = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: tmpDir,
    })

    expect(result).toBeNull()
  })

  test('detects framework via file path detector', async () => {
    // Sanity Studio is detected by the presence of sanity.config.ts (or .js/.mjs etc)
    // and having sanity in package.json
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({dependencies: {sanity: '3.0.0'}}))
    writeFileSync(join(tmpDir, 'sanity.config.ts'), 'export default {}')

    const result = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      rootPath: tmpDir,
    })

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('sanity-v3')
  })

  test('handles supersedes (more specific framework wins)', async () => {
    // Create a custom framework list where A supersedes B
    const frameworkB: Framework = {
      description: '',
      detectors: {
        every: [{matchPackage: 'base-pkg'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'Base',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'base',
    }
    const frameworkA: Framework = {
      description: '',
      detectors: {
        every: [{matchPackage: 'extended-pkg'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'Extended',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'extended',
      supersedes: ['base'],
    }

    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: {'base-pkg': '1.0.0', 'extended-pkg': '2.0.0'},
      }),
    )

    const result = await detectFrameworkRecord({
      frameworkList: [frameworkB, frameworkA],
      rootPath: tmpDir,
    })

    expect(result?.slug).toBe('extended')
  })

  test('matchContent detector matches file content with regex', async () => {
    const customFramework: Framework = {
      description: '',
      detectors: {
        every: [{matchContent: '"engine":\\s*"custom"', path: 'config.json'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'Custom',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'custom',
    }

    writeFileSync(join(tmpDir, 'config.json'), '{"engine": "custom"}')

    const result = await detectFrameworkRecord({
      frameworkList: [customFramework],
      rootPath: tmpDir,
    })

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('custom')
  })

  test('does not match framework with empty every array (vacuous truth guard)', async () => {
    const emptyDetectors: Framework = {
      description: '',
      detectors: {
        every: [],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'Empty',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'empty',
    }

    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({dependencies: {anything: '1.0.0'}}))

    const result = await detectFrameworkRecord({
      frameworkList: [emptyDetectors],
      rootPath: tmpDir,
    })

    expect(result).toBeNull()
  })

  test('escapes regex metacharacters in matchPackage names', async () => {
    const dotFramework: Framework = {
      description: '',
      detectors: {
        every: [{matchPackage: 'socket.io'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'SocketIO',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'socketio',
    }

    // "socketXio" should NOT match "socket.io" — the dot must be literal
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {socketXio: '1.0.0'}}),
    )

    const noMatch = await detectFrameworkRecord({
      frameworkList: [dotFramework],
      rootPath: tmpDir,
    })
    expect(noMatch).toBeNull()

    // "socket.io" should match
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({dependencies: {'socket.io': '4.0.0'}}),
    )

    const match = await detectFrameworkRecord({
      frameworkList: [dotFramework],
      rootPath: tmpDir,
    })
    expect(match).not.toBeNull()
    expect(match?.slug).toBe('socketio')
    expect(match?.detectedVersion).toBe('4.0.0')
  })

  test('matchContent detector returns null when content does not match', async () => {
    const customFramework: Framework = {
      description: '',
      detectors: {
        every: [{matchContent: '"engine":\\s*"custom"', path: 'config.json'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'Custom',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'custom',
    }

    writeFileSync(join(tmpDir, 'config.json'), '{"engine": "other"}')

    const result = await detectFrameworkRecord({
      frameworkList: [customFramework],
      rootPath: tmpDir,
    })

    expect(result).toBeNull()
  })

  test('detects framework via some detector (first match wins)', async () => {
    const multiConfig: Framework = {
      description: '',
      detectors: {
        some: [{path: 'app.config.ts'}, {path: 'app.config.js'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'MultiConfig',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'multiconfig',
    }

    // Only the .js variant exists — some should still match
    writeFileSync(join(tmpDir, 'app.config.js'), 'module.exports = {}')

    const result = await detectFrameworkRecord({
      frameworkList: [multiConfig],
      rootPath: tmpDir,
    })

    expect(result).not.toBeNull()
    expect(result?.slug).toBe('multiconfig')
  })

  test('returns null when no some detector matches', async () => {
    const multiConfig: Framework = {
      description: '',
      detectors: {
        some: [{path: 'app.config.ts'}, {path: 'app.config.js'}],
      },
      getOutputDirName: async () => '.',
      logo: '',
      name: 'MultiConfig',
      settings: {
        buildCommand: {value: ''},
        devCommand: {value: ''},
        installCommand: {placeholder: ''},
        outputDirectory: {placeholder: ''},
      },
      slug: 'multiconfig',
    }

    // Neither file exists
    const result = await detectFrameworkRecord({
      frameworkList: [multiConfig],
      rootPath: tmpDir,
    })

    expect(result).toBeNull()
  })
})

describe('@vercel/frameworks integration guard', () => {
  // These tests catch upstream breaking changes in the framework definitions
  // that would silently break our detection logic.

  const knownFrameworks = ['nextjs', 'remix', 'astro', 'svelte', 'nuxtjs', 'gatsby', 'sanity-v3']

  test('known frameworks exist in the frameworks list', () => {
    const slugs = (frameworks as readonly Framework[]).map((f) => f.slug)
    for (const slug of knownFrameworks) {
      expect(slugs, `Expected framework "${slug}" to exist in @vercel/frameworks`).toContain(slug)
    }
  })

  test('all frameworks with detectors have valid detector shape', () => {
    for (const fw of frameworks as readonly Framework[]) {
      if (!fw.detectors) continue

      if (fw.detectors.every) {
        expect(
          Array.isArray(fw.detectors.every),
          `${fw.slug}: detectors.every should be an array`,
        ).toBe(true)
        for (const d of fw.detectors.every) {
          expect(
            typeof d.path === 'string' || typeof d.matchPackage === 'string',
            `${fw.slug}: every detector must have "path" or "matchPackage"`,
          ).toBe(true)
        }
      }

      if (fw.detectors.some) {
        expect(
          Array.isArray(fw.detectors.some),
          `${fw.slug}: detectors.some should be an array`,
        ).toBe(true)
        for (const d of fw.detectors.some) {
          expect(
            typeof d.path === 'string' || typeof d.matchPackage === 'string',
            `${fw.slug}: some detector must have "path" or "matchPackage"`,
          ).toBe(true)
        }
      }
    }
  })

  test('Next.js detector uses matchPackage for "next"', () => {
    const nextjs = (frameworks as readonly Framework[]).find((f) => f.slug === 'nextjs')
    expect(nextjs).toBeDefined()
    expect(nextjs?.detectors?.every).toBeDefined()
    const hasNextDetector = nextjs?.detectors?.every?.some((d) => d.matchPackage === 'next')
    expect(hasNextDetector, 'Next.js should detect via matchPackage "next"').toBe(true)
  })
})

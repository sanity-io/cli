import fs from 'node:fs'
import path from 'node:path'

import {describe, expect, test} from 'vitest'

import {createMediaLibraryCliConfig} from '../createMediaLibraryCliConfig.js'
import {determineAppTemplate} from '../determineAppTemplate.js'
import {determineMediaLibraryTemplate} from '../determineMediaLibraryTemplate.js'
import {templateChoices} from '../scaffoldTemplate.js'
import templates from '../templates/index.js'

describe('determineMediaLibraryTemplate', () => {
  test('recognizes the media-library-config template', () => {
    expect(determineMediaLibraryTemplate('media-library-config')).toBe(true)
    expect(determineMediaLibraryTemplate('app-quickstart')).toBe(false)
    expect(determineMediaLibraryTemplate('clean')).toBe(false)
  })

  test('stays disjoint from determineAppTemplate', () => {
    // bootstrapLocalTemplate branches on the two separately: a template
    // matching both would get the SDK dependency base and App.tsx processing.
    expect(determineAppTemplate('media-library-config')).toBe(false)
  })
})

describe('media-library-config template registration', () => {
  const template = templates['media-library-config']

  test('is registered with its own dependency set and scripts', () => {
    expect(template).toBeDefined()
    expect(template?.typescriptOnly).toBe(true)
    expect(template?.type).toBe('module')
    expect(template?.scripts).toEqual({
      build: 'sanity build',
      deploy: 'sanity deploy',
      dev: 'sanity dev',
    })
    // The island runtime ships in sanity >= 6.20.0; the floor must not regress.
    expect(template?.dependencies?.sanity).toBe('^6.20.0')
    expect(template?.entry).toBeUndefined()
  })

  test('is unlisted: not offered in the template prompt', () => {
    expect(templateChoices.map((choice) => choice.value)).not.toContain('media-library-config')
  })

  test('config references the field modules the template ships', () => {
    const templateDir = path.resolve(
      import.meta.dirname,
      '../../../../templates/media-library-config',
    )
    const config = createMediaLibraryCliConfig({organizationId: 'orgId123'})

    const srcPaths = [...config.matchAll(/src: '([^']+)'/g)].map((match) => match[1])
    expect(srcPaths.length).toBeGreaterThan(0)
    for (const src of srcPaths) {
      expect(fs.existsSync(path.join(templateDir, src))).toBe(true)
    }
  })

  test('ships its eslint config as .txt (renamed to eslint.config.mjs on copy)', () => {
    // Stored with a .txt extension — same trick as shared/gitignore.txt — so
    // the repo's own ESLint doesn't pick it up as the nearest config for the
    // template files. bootstrapLocalTemplate renames it after copying.
    const templateDir = path.resolve(
      import.meta.dirname,
      '../../../../templates/media-library-config',
    )
    expect(fs.existsSync(path.join(templateDir, 'eslint.config.txt'))).toBe(true)
    expect(fs.existsSync(path.join(templateDir, 'eslint.config.mjs'))).toBe(false)
  })
})

describe('createMediaLibraryCliConfig', () => {
  test('generates a stock unstable_defineMediaLibrary config', () => {
    expect(createMediaLibraryCliConfig({organizationId: 'orgId123'})).toMatchInlineSnapshot(`
      "import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

      export default defineCliConfig({
        app: unstable_defineMediaLibrary({
          organizationId: 'orgId123',
          fields: [
            {name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
            {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
          ],
        }),
      })
      "
    `)
  })
})

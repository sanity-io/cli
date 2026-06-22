import {mkdtempSync, rmSync} from 'node:fs'
import fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test} from 'vitest'

import {writeWorkbenchRuntime} from '../../../../src/actions/dev/writeWorkbenchRuntime.js'

describe('writeWorkbenchRuntime', () => {
  // The default-args output is identical across most assertions, so generate it
  // once and let every read-only check share the same directory and file reads.
  let tmpDir: string
  let result: string
  let workbenchJs: string
  let indexHtml: string

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sanity-workbench-'))
    result = await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})
    workbenchJs = await fs.readFile(join(result, 'workbench.js'), 'utf8')
    indexHtml = await fs.readFile(join(result, 'index.html'), 'utf8')
  })

  afterAll(() => {
    rmSync(tmpDir, {recursive: true})
  })

  test('returns the absolute path to the workbench directory', () => {
    expect(result).toBe(join(tmpDir, '.sanity', 'workbench'))
  })

  test('creates the .sanity/workbench directory', async () => {
    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  describe('workbench.js', () => {
    test('writes workbench.js to the workbench directory', async () => {
      const stat = await fs.stat(join(result, 'workbench.js'))
      expect(stat.isFile()).toBe(true)
    })

    test('imports renderWorkbench from sanity/workbench', () => {
      expect(workbenchJs).toContain('import {renderWorkbench} from "sanity/workbench"')
    })

    test('substitutes reactStrictMode: false into workbench.js', () => {
      expect(workbenchJs).toContain('{reactStrictMode: false}')
      expect(workbenchJs).not.toContain('%SANITY_WORKBENCH_REACT_STRICT_MODE%')
    })

    test('passes the workbench element id to renderWorkbench', () => {
      expect(workbenchJs).toContain('document.getElementById("workbench")')
    })

    test('passes organizationId: undefined when not provided', () => {
      expect(workbenchJs).toContain('{organizationId: undefined}')
      expect(workbenchJs).not.toContain('%SANITY_WORKBENCH_ORGANIZATION_ID%')
    })
  })

  describe('index.html', () => {
    test('writes index.html to the workbench directory', async () => {
      const stat = await fs.stat(join(result, 'index.html'))
      expect(stat.isFile()).toBe(true)
    })

    test('includes a div with id="workbench"', () => {
      expect(indexHtml).toContain('<div id="workbench">')
    })

    test('includes a module script tag loading workbench.js', () => {
      expect(indexHtml).toContain('<script type="module" src="./workbench.js">')
    })

    test('starts with a DOCTYPE and has a charset meta tag', () => {
      expect(indexHtml).toContain('<!DOCTYPE html>')
      expect(indexHtml).toContain('<meta charset="UTF-8" />')
    })

    test('omits prefetch hints when remoteUrl is not provided', () => {
      expect(indexHtml).not.toContain('rel="preconnect"')
      expect(indexHtml).not.toContain('rel="preload"')
    })
  })

  // These exercise non-default inputs, so each writes its own isolated runtime.
  describe('with custom options', () => {
    let customDir: string

    beforeEach(() => {
      customDir = mkdtempSync(join(tmpdir(), 'sanity-workbench-'))
    })

    afterEach(() => {
      rmSync(customDir, {recursive: true})
    })

    test('creates nested directories even if .sanity does not exist', async () => {
      const nestedCwd = join(customDir, 'nested', 'project')
      await fs.mkdir(nestedCwd, {recursive: true})

      await writeWorkbenchRuntime({cwd: nestedCwd, reactStrictMode: false})

      const stat = await fs.stat(join(nestedCwd, '.sanity', 'workbench'))
      expect(stat.isDirectory()).toBe(true)
    })

    test('substitutes reactStrictMode: true into workbench.js', async () => {
      await writeWorkbenchRuntime({cwd: customDir, reactStrictMode: true})

      const content = await fs.readFile(
        join(customDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{reactStrictMode: true}')
      expect(content).not.toContain('%SANITY_WORKBENCH_REACT_STRICT_MODE%')
    })

    test('passes organizationId as string when provided', async () => {
      await writeWorkbenchRuntime({
        cwd: customDir,
        organizationId: 'org-123',
        reactStrictMode: false,
      })

      const content = await fs.readFile(
        join(customDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{organizationId: "org-123"}')
      expect(content).not.toContain('%SANITY_WORKBENCH_ORGANIZATION_ID%')
    })

    describe('prefetch hints', () => {
      test('omits prefetch hints when remoteUrl is invalid', async () => {
        await writeWorkbenchRuntime({
          cwd: customDir,
          reactStrictMode: false,
          remoteUrl: 'not-a-url',
        })

        const content = await fs.readFile(
          join(customDir, '.sanity', 'workbench', 'index.html'),
          'utf8',
        )
        expect(content).not.toContain('rel="preconnect"')
        expect(content).not.toContain('rel="preload"')
      })

      test('emits a preconnect hint pointing at the remote origin', async () => {
        await writeWorkbenchRuntime({
          cwd: customDir,
          reactStrictMode: false,
          remoteUrl: 'https://workbench.example/mf-manifest.json',
        })

        const content = await fs.readFile(
          join(customDir, '.sanity', 'workbench', 'index.html'),
          'utf8',
        )
        expect(content).toContain('<link rel="preconnect" href="https://workbench.example" />')
      })

      test('emits a preload hint for the manifest with as=fetch and crossorigin', async () => {
        await writeWorkbenchRuntime({
          cwd: customDir,
          reactStrictMode: false,
          remoteUrl: 'https://workbench.example/mf-manifest.json',
        })

        const content = await fs.readFile(
          join(customDir, '.sanity', 'workbench', 'index.html'),
          'utf8',
        )
        expect(content).toContain(
          '<link rel="preload" as="fetch" href="https://workbench.example/mf-manifest.json" crossorigin />',
        )
      })
    })
  })
})

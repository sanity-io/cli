import {mkdtempSync, rmSync} from 'node:fs'
import fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {writeWorkbenchRuntime} from '../writeWorkbenchRuntime.js'

describe('writeWorkbenchRuntime', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sanity-workbench-'))
  })

  afterEach(() => {
    rmSync(tmpDir, {recursive: true})
  })

  test('returns the absolute path to the workbench directory', async () => {
    const result = await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

    expect(result).toBe(join(tmpDir, '.sanity', 'workbench'))
  })

  test('creates the .sanity/workbench directory', async () => {
    await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

    const stat = await fs.stat(join(tmpDir, '.sanity', 'workbench'))
    expect(stat.isDirectory()).toBe(true)
  })

  test('creates nested directories even if .sanity does not exist', async () => {
    const nestedCwd = join(tmpDir, 'nested', 'project')
    await fs.mkdir(nestedCwd, {recursive: true})

    await writeWorkbenchRuntime({cwd: nestedCwd, reactStrictMode: false})

    const stat = await fs.stat(join(nestedCwd, '.sanity', 'workbench'))
    expect(stat.isDirectory()).toBe(true)
  })

  describe('workbench.js', () => {
    test('writes workbench.js to the workbench directory', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const stat = await fs.stat(join(tmpDir, '.sanity', 'workbench', 'workbench.js'))
      expect(stat.isFile()).toBe(true)
    })

    test('imports renderWorkbench from sanity/workbench', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('import {renderWorkbench} from "sanity/workbench"')
    })

    test('substitutes reactStrictMode: false into workbench.js', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{reactStrictMode: false}')
      expect(content).not.toContain('%SANITY_WORKBENCH_REACT_STRICT_MODE%')
    })

    test('substitutes reactStrictMode: true into workbench.js', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: true})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{reactStrictMode: true}')
      expect(content).not.toContain('%SANITY_WORKBENCH_REACT_STRICT_MODE%')
    })

    test('passes the workbench element id to renderWorkbench', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('document.getElementById("workbench")')
    })

    test('passes organizationId: undefined when not provided', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{organizationId: undefined}')
      expect(content).not.toContain('%SANITY_WORKBENCH_ORGANIZATION_ID%')
    })

    test('passes organizationId as string when provided', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, organizationId: 'org-123', reactStrictMode: false})

      const content = await fs.readFile(
        join(tmpDir, '.sanity', 'workbench', 'workbench.js'),
        'utf8',
      )
      expect(content).toContain('{organizationId: "org-123"}')
      expect(content).not.toContain('%SANITY_WORKBENCH_ORGANIZATION_ID%')
    })
  })

  describe('index.html', () => {
    test('writes index.html to the workbench directory', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const stat = await fs.stat(join(tmpDir, '.sanity', 'workbench', 'index.html'))
      expect(stat.isFile()).toBe(true)
    })

    test('includes a div with id="workbench"', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(join(tmpDir, '.sanity', 'workbench', 'index.html'), 'utf8')
      expect(content).toContain('<div id="workbench">')
    })

    test('includes a module script tag loading workbench.js', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(join(tmpDir, '.sanity', 'workbench', 'index.html'), 'utf8')
      expect(content).toContain('<script type="module" src="./workbench.js">')
    })

    test('is valid HTML with charset meta tag', async () => {
      await writeWorkbenchRuntime({cwd: tmpDir, reactStrictMode: false})

      const content = await fs.readFile(join(tmpDir, '.sanity', 'workbench', 'index.html'), 'utf8')
      expect(content).toContain('<!DOCTYPE html>')
      expect(content).toContain('<meta charset="UTF-8" />')
    })
  })
})

import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {type VersionedFramework} from '../../types.js'
import {getFrameworkScaffold, isInPlaceFramework} from '../index.js'
import {nextjsScaffold} from '../nextjs.js'

const nextjs = {name: 'Next.js', slug: 'nextjs'} as VersionedFramework
const astro = {name: 'Astro', slug: 'astro'} as VersionedFramework
const nuxt = {name: 'Nuxt', slug: 'nuxtjs'} as VersionedFramework
const reactRouter = {name: 'React Router', slug: 'react-router'} as VersionedFramework
const remix = {name: 'Remix', slug: 'remix'} as VersionedFramework

describe('getFrameworkScaffold', () => {
  test('returns the Next.js scaffold for Next.js', () => {
    expect(getFrameworkScaffold(nextjs)).toBe(nextjsScaffold)
  })

  test('returns undefined for frameworks without a scaffold', () => {
    expect(getFrameworkScaffold(astro)).toBeUndefined()
  })

  test('returns undefined when no framework is detected', () => {
    expect(getFrameworkScaffold(null)).toBeUndefined()
  })

  test('returns undefined when the framework has no slug', () => {
    expect(getFrameworkScaffold({name: 'Other', slug: null} as never)).toBeUndefined()
  })
})

describe('isInPlaceFramework', () => {
  let workDir: string

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'init-in-place-framework-'))
  })

  afterEach(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  test('is false when no framework is detected', async () => {
    await writeFile(join(workDir, 'package.json'), '{}')

    expect(isInPlaceFramework(null, workDir)).toBe(false)
  })

  test('is false for a framework without a slug', async () => {
    await writeFile(join(workDir, 'package.json'), '{}')

    expect(isInPlaceFramework({name: 'Other', slug: null} as never, workDir)).toBe(false)
  })

  test('is false for frameworks outside the allowlist, including existing Studios', async () => {
    await writeFile(join(workDir, 'package.json'), '{}')

    expect(isInPlaceFramework({name: 'Sanity', slug: 'sanity'} as never, workDir)).toBe(false)
    expect(isInPlaceFramework({name: 'Sanity (v2)', slug: 'sanity-v2'} as never, workDir)).toBe(
      false,
    )
    expect(isInPlaceFramework({name: 'Vite', slug: 'vite'} as never, workDir)).toBe(false)
    expect(isInPlaceFramework({name: 'Express', slug: 'express'} as never, workDir)).toBe(false)
  })

  test('is false when the folder has no package.json', async () => {
    expect(isInPlaceFramework(nextjs, workDir)).toBe(false)
  })

  test('is true for the documented frameworks when the folder has a package.json', async () => {
    await writeFile(join(workDir, 'package.json'), '{}')

    expect(isInPlaceFramework(nextjs, workDir)).toBe(true)
    expect(isInPlaceFramework(astro, workDir)).toBe(true)
    expect(isInPlaceFramework(nuxt, workDir)).toBe(true)
    expect(isInPlaceFramework(reactRouter, workDir)).toBe(true)
    expect(isInPlaceFramework(remix, workDir)).toBe(true)
  })
})

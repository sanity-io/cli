/**
 * Runs `planAspectSync` against the REAL `templates/media-library-config`
 * field modules with an unmocked `importModule`, so the evaluation path a
 * deploy takes — jiti, including its JSX transform — is exercised against
 * exactly what `sanity init` scaffolds. Guards the regression where the
 * template's `.tsx` field failed to parse because jiti had JSX disabled.
 *
 * The field list is globbed from the template's `src/fields/` directory, so
 * a field added to the template is picked up here automatically.
 */

import {readdir} from 'node:fs/promises'
import path from 'node:path'

import {createTestToken, mockApi} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../../services/mediaLibraries.js'
import {planAspectSync} from '../syncAspects.js'

const TEMPLATE_DIR = path.resolve(
  import.meta.dirname,
  '../../../../../templates/media-library-config',
)

function mockLibraryList(libraries: string[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {organizationId: 'test-org-id'},
    uri: '/media-libraries',
  }).reply(200, {
    data: libraries.map((id) => ({id, organizationId: 'test-org-id', status: 'active'})),
  })
}

/** The library stores no aspects: the id query returns one empty page. */
function mockNoStoredIds(libraryId: string) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'post',
    query: {perspective: 'published', tag: 'sanity.cli.aspect-sync'},
    uri: `/media-libraries/${libraryId}/query`,
  }).reply(200, {result: []})
}

describe('planAspectSync against the real media-library-config template', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'all mocked requests should be consumed').toEqual([])
  })

  test('evaluates every shipped field module, including .tsx inputs', async () => {
    createTestToken('test-token')
    mockLibraryList(['test-library-id'])
    mockNoStoredIds('test-library-id')

    const fieldFiles = await readdir(path.join(TEMPLATE_DIR, 'src', 'fields'))
    expect(fieldFiles.length).toBeGreaterThan(0)
    // The regression this file guards came from a JSX module — keep one around.
    expect(fieldFiles.some((file) => file.endsWith('.tsx'))).toBe(true)

    const fields = fieldFiles.map((file) => {
      const name = path.parse(file).name
      return {name, src: `./src/fields/${file}`, title: name}
    })

    const result = await planAspectSync({
      fields,
      organizationId: 'test-org-id',
      workDir: TEMPLATE_DIR,
    })

    if ('failure' in result) {
      expect.fail(`template fields failed to plan: ${result.failure.message}`)
    }
    expect(result.plan.documents.map((document) => document._id).toSorted()).toEqual(
      fields.map((field) => field.name).toSorted(),
    )
    // The template's custom-input field keeps its component in the live
    // config but the stored mirror strips it.
    expect(result.plan.strippedByField.notes).toContain('definition.components')
  })
})

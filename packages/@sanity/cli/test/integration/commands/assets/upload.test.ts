import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import {afterAll, afterEach, beforeAll, describe, expect, test} from 'vitest'

import {UploadAssetCommand} from '../../../../src/commands/assets/upload.js'
import {ASSETS_API_VERSION} from '../../../../src/services/assets.js'

describe('#assets:upload integration', () => {
  const projectId = 'test-project'
  const dataset = 'production'
  const bytes = Buffer.from([0, 1, 2, 3, 255])
  let fixtureDirectory: string
  let fixturePath: string

  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'sanity-assets-upload-'))
    fixturePath = join(fixtureDirectory, 'fixture.png')
    await writeFile(fixturePath, bytes)
  })

  afterEach(() => {
    const pending = pendingMocks()
    cleanAll()
    expect(pending).toEqual([])
  })

  afterAll(async () => {
    await rm(fixtureDirectory, {force: true, recursive: true})
  })

  test('sends unchanged bytes and prints the returned asset document', async () => {
    let uploadedBody: Buffer | undefined
    const asset = {
      _id: 'image-abc-1x1-png',
      _type: 'sanity.imageAsset',
      extension: 'png',
      mimeType: 'image/png',
      originalFilename: 'fixture.png',
      size: bytes.length,
      url: `https://cdn.sanity.io/images/${projectId}/${dataset}/abc-1x1.png`,
    }

    nock(`https://${projectId}.api.sanity.io`)
      .post(`/${ASSETS_API_VERSION}/assets/images/${dataset}`, (body) => {
        // Nock represents an application/octet-stream request body as a hex string.
        uploadedBody = Buffer.isBuffer(body) ? body : Buffer.from(body as string, 'hex')
        return true
      })
      .query(true)
      .reply(200, {document: asset})

    const {error, stderr, stdout} = await testCommand(
      UploadAssetCommand,
      [
        '--file',
        fixturePath,
        '--type',
        'image',
        '--content-type',
        'image/png',
        '--project-id',
        projectId,
        '--dataset',
        dataset,
      ],
      {mocks: {token: 'test-token'}},
    )

    if (error) throw error
    expect(uploadedBody).toEqual(bytes)
    expect(stderr).toBe(
      [
        '- Uploading image asset. Large uploads may take several minutes.',
        'Creating image asset document',
        `✔ Uploaded image asset: ${asset._id}`,
        '',
      ].join('\n'),
    )
    expect(JSON.parse(stdout)).toEqual({
      asset,
      reference: {
        _type: 'image',
        asset: {_ref: asset._id, _type: 'reference'},
      },
    })
  })
})

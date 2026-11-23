import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {saveBlueprintProfile} from '@sanity/cli-core/config'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DOCUMENTS_API_VERSION} from '../../../src/actions/documents/constants.js'
import {UploadAssetCommand} from '../../../src/commands/assets/upload.js'
import {UpdateKnowledgeBaseCommand} from '../../../src/commands/context/update.js'
import {Add as CorsAdd} from '../../../src/commands/cors/add.js'
import {Delete as CorsDelete} from '../../../src/commands/cors/delete.js'
import {CreateDatasetCommand} from '../../../src/commands/datasets/create.js'
import {DeleteDatasetCommand} from '../../../src/commands/datasets/delete.js'
import {ListDatasetCommand} from '../../../src/commands/datasets/list.js'
import {DatasetVisibilitySetCommand} from '../../../src/commands/datasets/visibility/set.js'
import {CreateDocumentCommand} from '../../../src/commands/documents/create.js'
import {DeleteDocumentCommand} from '../../../src/commands/documents/delete.js'
import {QueryDocumentCommand} from '../../../src/commands/documents/query.js'
import {Undeploy as GraphQLUndeploy} from '../../../src/commands/graphql/undeploy.js'
import {InitCommand} from '../../../src/commands/init.js'
import {PreviewCommand} from '../../../src/commands/preview.js'
import {CreateProjectCommand} from '../../../src/commands/projects/create.js'
import {ListSchemaCommand} from '../../../src/commands/schemas/list.js'
import {CreateTokenCommand} from '../../../src/commands/tokens/create.js'
import {DeleteTokensCommand} from '../../../src/commands/tokens/delete.js'
import {UndeployCommand} from '../../../src/commands/undeploy.js'
import {ASSETS_API_VERSION} from '../../../src/services/assets.js'
import {CORS_API_VERSION} from '../../../src/services/cors.js'
import {DATASET_API_VERSION} from '../../../src/services/datasets.js'
import {GRAPHQL_API_VERSION} from '../../../src/services/graphql.js'
import {ORGANIZATIONS_API_VERSION} from '../../../src/services/organizations.js'
import {PROJECTS_API_VERSION} from '../../../src/services/projects.js'
import {SCHEMA_API_VERSION} from '../../../src/services/schemas.js'

const projectId = 'blueprint1'
const stackId = 'ST-blueprint1'
const datasetName = 'preview'
const manifestName = 'sanity.blueprint.json'
const profileName = 'preview'
const dataset = {
  aclMode: 'public',
  datasetName,
  name: 'dataset-preview',
  type: 'sanity.project.dataset',
}

describe('Blueprint profile commands', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cli-blueprint-workspace-'))
    vi.spyOn(process, 'cwd').mockReturnValue(directory)
    vi.stubEnv('CI', '1')
    for (const name of [
      'SANITY_BLUEPRINT_PATH',
      'SANITY_BLUEPRINT_PROFILE',
      'SANITY_CLI_MODE',
      'SANITY_DATASET',
      'SANITY_BLUEPRINT_STACK_ID',
      'SANITY_ORGANIZATION_ID',
      'SANITY_PROJECT_ID',
    ])
      vi.stubEnv(name, undefined)
    vi.stubEnv('SANITY_BLUEPRINT_CONFIG_DIR', join(directory, 'profiles'))
    nock.disableNetConnect()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(directory, {force: true, recursive: true})
    const pending = pendingMocks()
    cleanAll()
    nock.enableNetConnect()
    expect(pending).toEqual([])
  })

  async function selectProfile(resources?: object[]) {
    let blueprintPath: string | undefined
    if (resources) {
      blueprintPath = join(directory, manifestName)
      await writeFile(blueprintPath, JSON.stringify({blueprintVersion: '2024-10-01', resources}))
    }
    await saveBlueprintProfile(profileName, {blueprintPath, dataset: datasetName, projectId})
    vi.stubEnv('SANITY_BLUEPRINT_PROFILE', profileName)
  }

  test('init declares a missing dataset and leaves profile selection explicit', async () => {
    mockApi({apiVersion: 'v2025-08-30', uri: '/users/me'}).reply(200, {
      id: 'test-user',
      provider: 'github',
    })
    mockApi({
      apiVersion: 'v2025-09-22',
      query: {onlyExplicitMembership: 'true'},
      uri: '/projects',
    }).reply(200, [{createdAt: '2026-11-10', displayName: 'Preview Project', id: projectId}])
    mockApi({apiVersion: 'v2025-09-16', projectId, uri: '/features'}).reply(200, ['privateDataset'])
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    }).reply(200, [])
    mockApi({apiVersion: 'v2026-06-15', method: 'post', uri: '/blueprints/stacks'}).reply(200, {
      id: stackId,
    })

    const {error, stdout} = await testCommand(InitCommand, [
      '--with-blueprints',
      '--yes',
      '--json',
      '--project',
      projectId,
      '--dataset',
      datasetName,
      '--visibility',
      'private',
    ])

    expect(error).toBeUndefined()
    expect(JSON.parse(stdout), stdout).toMatchObject({dataset: datasetName, projectId, stackId})
    const manifest = JSON.parse(await readFile(join(directory, manifestName), 'utf8'))
    expect(manifest.resources).toEqual([{...dataset, aclMode: 'private'}])
    await expect(readFile(join(directory, 'sanity.blueprint-cli.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('uses the same profile from a fresh directory and a conflicting Studio checkout', async () => {
    await selectProfile()
    const studio = join(directory, 'studio')
    await mkdir(studio)
    await writeFile(join(studio, 'sanity.cli.js'), 'throw Error("must not load Studio CLI config")')
    await writeFile(join(studio, 'sanity.blueprint-cli.json'), 'invalid old marker')
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    })
      .twice()
      .reply(200, [{name: datasetName}])
    mockApi({apiVersion: DATASET_API_VERSION, projectId, uri: '/aliases'}).twice().reply(200, [])

    for (const cwd of [directory, studio]) {
      vi.spyOn(process, 'cwd').mockReturnValue(cwd)
      const {error, stdout} = await testCommand(ListDatasetCommand)
      expect(error).toBeUndefined()
      expect(stdout).toBe(`${datasetName}\n`)
    }
  })

  test('keeps the Blueprint dataset paired with its project', async () => {
    await selectProfile()
    const {error} = await testCommand(QueryDocumentCommand, ['*', '--project', 'other-project'])
    expect(error?.message).toMatch(/Dataset is required/)
  })

  test('creates and deletes documents in the profile dataset', async () => {
    await selectProfile()
    const document = {_id: 'enrolled-document', _type: 'note'}
    const file = join(directory, 'note.json')
    await writeFile(file, JSON.stringify(document))
    const mutatePath = `/v${DOCUMENTS_API_VERSION}/data/mutate/${datasetName}`
    const api = nock(`https://${projectId}.api.sanity.io`)
    api
      .post(mutatePath, {mutations: [{create: document}]})
      .query(true)
      .reply(200, {results: [{id: document._id, operation: 'create'}], transactionId: 'create'})
    api
      .post(mutatePath, {mutations: [{delete: {id: document._id}}]})
      .query(true)
      .reply(200, {results: [{id: document._id, operation: 'delete'}], transactionId: 'delete'})

    const create = await testCommand(CreateDocumentCommand, [file])
    expect(create.error).toBeUndefined()
    expect(create.stdout).toContain(document._id)

    const remove = await testCommand(DeleteDocumentCommand, [document._id])
    expect(remove.error).toBeUndefined()
    expect(remove.stdout).toContain('Deleted 1 document')
  })

  test('requires an explicit dataset for document writes to a different project', async () => {
    await selectProfile()
    const target = ['--project', 'other-project']
    const file = join(directory, 'note.json')
    const create = await testCommand(CreateDocumentCommand, [file, ...target])
    const remove = await testCommand(DeleteDocumentCommand, ['enrolled-document', ...target])
    expect(create.error?.message).toContain('Dataset is required')
    expect(remove.error?.message).toContain('Dataset is required')
  })

  test('uploads an asset to the enrolled dataset', async () => {
    await selectProfile()
    const file = join(directory, 'image.png')
    await writeFile(file, Buffer.from([0, 1, 2, 3]))
    const asset = {_id: 'image-a-1x1-png', _type: 'sanity.imageAsset'}
    nock(`https://${projectId}.api.sanity.io`)
      .post(`/${ASSETS_API_VERSION}/assets/images/${datasetName}`)
      .query(true)
      .reply(200, {document: asset})

    const {error, stdout} = await testCommand(UploadAssetCommand, [
      '--file',
      file,
      '--content-type',
      'image/png',
    ])
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout).asset).toMatchObject(asset)
  })

  test('undeploys the GraphQL API for the profile dataset', async () => {
    await selectProfile()
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      method: 'delete',
      projectId,
      uri: `/apis/graphql/${datasetName}/default`,
    }).reply(204)

    const {error, stdout} = await testCommand(GraphQLUndeploy, ['--force'])
    expect(error).toBeUndefined()
    expect(stdout).toContain('GraphQL API deleted')
  })

  test('declares a token for the profile project in unattended mode', async () => {
    await selectProfile()
    const {error, stdout} = await testCommand(CreateTokenCommand, ['CI', '--yes', '--json'])
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout).resources).toMatchObject([
      {
        label: 'CI',
        memberships: [{resourceId: projectId, resourceType: 'project'}],
        type: 'sanity.access.robot',
      },
    ])
  })

  test('lists deployed schemas without loading a Studio', async () => {
    await selectProfile()
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/${datasetName}/schemas`,
    }).reply(200, [{_id: '_.schemas.preview', workspace: {name: 'preview'}}])

    const {error, stdout} = await testCommand(ListSchemaCommand, ['--json'])
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout)).toMatchObject([{_id: '_.schemas.preview'}])
  })

  test('explains where to run preview from a Blueprint-only workspace', async () => {
    await selectProfile()

    const {error} = await testCommand(PreviewCommand)
    expect(error?.message).toContain('This command needs a local Studio or app configuration')
  })

  test('legacy mode uses the Studio project despite the selected profile and Blueprint files', async () => {
    await selectProfile()
    vi.stubEnv('SANITY_CLI_MODE', 'legacy')
    await writeFile(
      join(directory, 'sanity.cli.js'),
      `module.exports = {api: {projectId: '${projectId}'}}`,
    )
    await writeFile(join(directory, 'sanity.blueprint.ts'), 'throw Error("must not load")')
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    }).reply(200, [])
    mockApi({apiVersion: 'v2025-09-16', projectId, uri: '/features'}).reply(200, ['privateDataset'])
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      method: 'put',
      projectId,
      uri: `/datasets/${datasetName}`,
    }).reply(200, {datasetName})

    const {error, stdout} = await testCommand(CreateDatasetCommand, [
      datasetName,
      '--visibility',
      'private',
    ])
    expect(error).toBeUndefined()
    expect(stdout).toContain('Dataset created')
  })

  test('dataset and CORS creation print declarations without sending a request', async () => {
    await selectProfile()
    const datasetResult = await testCommand(CreateDatasetCommand, [
      datasetName,
      '--visibility',
      'private',
    ])
    expect(datasetResult.error).toBeUndefined()
    expect(datasetResult.stdout).toContain('"type": "sanity.project.dataset"')
    expect(datasetResult.stdout).toContain('"aclMode": "private"')
    const corsResult = await testCommand(CorsAdd, ['https://example.com', '--credentials'])
    expect(corsResult.error).toBeUndefined()
    expect(corsResult.stdout).toContain('"type": "sanity.project.cors"')
    expect(corsResult.stdout).toContain('"allowCredentials": true')
    await expect(readFile(join(directory, manifestName))).rejects.toMatchObject({code: 'ENOENT'})
  })

  test('refuses dataset deletion when a custom manifest declares it', async () => {
    await selectProfile()
    const path = join(directory, 'selected-blueprint.json')
    await writeFile(path, JSON.stringify({resources: [dataset]}))
    vi.stubEnv('SANITY_BLUEPRINT_PATH', path)

    const {error} = await testCommand(DeleteDatasetCommand, [datasetName, '--force'])
    expect(error?.message).toContain('A Blueprint manages dataset "preview"')
  })

  test('recognizes the enrolled organization when project creation targets its slug', async () => {
    await selectProfile()
    vi.stubEnv('SANITY_ORGANIZATION_ID', 'org-123')
    mockApi({apiVersion: ORGANIZATIONS_API_VERSION, uri: '/organizations'}).reply(200, [
      {id: 'org-123', slug: 'my-org'},
    ])

    const {error, stdout} = await testCommand(CreateProjectCommand, [
      'Site',
      '--organization',
      'my-org',
      '--json',
    ])
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout).resources).toMatchObject([
      {displayName: 'Site', type: 'sanity.project'},
    ])
  })

  test('uses Blueprint mode for an explicit project outside the profile', async () => {
    await selectProfile([])
    const {error, stdout} = await testCommand(CreateDatasetCommand, [
      datasetName,
      '--project',
      'otherproject',
      '--visibility',
      'private',
    ])
    expect(error).toBeUndefined()
    expect(stdout).toContain('"project": "otherproject"')
    expect(stdout).not.toContain(join(directory, manifestName))
  })

  test('accepts an explicit organization for declarations from a project profile', async () => {
    await selectProfile([])
    mockApi({apiVersion: ORGANIZATIONS_API_VERSION, uri: '/organizations'}).reply(200, [
      {id: 'org-123', slug: 'my-org'},
    ])
    const {error, stdout} = await testCommand(CreateProjectCommand, [
      'Site',
      '--organization',
      'my-org',
      '--json',
    ])
    expect(error).toBeUndefined()
    expect(JSON.parse(stdout)).toMatchObject({resources: [{type: 'sanity.project'}]})
    expect(JSON.parse(stdout)).not.toHaveProperty('blueprintPath')
  })

  test('stops a knowledge base update when its ownership scope cannot be resolved', async () => {
    await selectProfile()
    nock('https://api.sanity.io')
      .get('/v2026-08-25/context/knowledge-bases/kb-preview')
      .query(true)
      .reply(403, {message: 'Could not read knowledge base metadata'})

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-preview',
      '--title',
      'Preview title',
    ])
    expect(error?.message).toContain('Could not read knowledge base metadata')
  })

  test('uses the resolved app organization to verify ownership before undeploying', async () => {
    await selectProfile()
    const org = 'org-123'
    const appId = 'core-id'
    vi.stubEnv('SANITY_ORGANIZATION_ID', org)
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}`,
    }).reply(200, {appHost: 'core-host', id: appId, organizationId: org})
    mockApi({
      apiVersion: 'vX',
      query: {id: appId, type: 'sanity.application'},
      uri: '/blueprints/resources/search',
    })
      .matchHeader('x-sanity-scope-type', 'organization')
      .matchHeader('x-sanity-scope-id', org)
      .reply(200, [])
    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}`,
    }).reply(200)

    const {error, stdout} = await testCommand(UndeployCommand, [appId, '--yes'])
    expect(error).toBeUndefined()
    expect(stdout).toContain('Application undeploy scheduled')
  })

  test('refuses changes to an existing dataset owned by a different Stack', async () => {
    await selectProfile()
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    }).reply(200, [{aclMode: 'public', name: datasetName}])
    mockApi({
      apiVersion: 'vX',
      query: {id: `${projectId}:${datasetName}`, type: 'sanity.project.dataset'},
      uri: '/blueprints/resources/search',
    })
      .matchHeader('x-sanity-scope-type', 'project')
      .matchHeader('x-sanity-scope-id', projectId)
      .reply(200, [{stackId}])
    mockApi({apiVersion: 'vX', uri: `/blueprints/stacks/${stackId}`}).reply(200, {
      name: 'Shared Stack',
    })

    const {error} = await testCommand(DatasetVisibilitySetCommand, [datasetName, 'private'])
    expect(error?.message).toContain('Blueprint Stack "Shared Stack" manages dataset "preview"')
  })

  test('refuses to delete a CORS origin owned by an organization Stack', async () => {
    await selectProfile()
    const organizationId = 'org-123'
    const origin = 'https://preview.example.com'
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${projectId}/cors`,
    }).reply(200, [{id: 125, origin}])
    const query = {id: `${projectId}:125`, type: 'sanity.project.cors'}
    mockApi({apiVersion: 'vX', query, uri: '/blueprints/resources/search'})
      .matchHeader('x-sanity-scope-type', 'project')
      .matchHeader('x-sanity-scope-id', projectId)
      .reply(200, [])
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId,
      uri: `/projects/${projectId}`,
    }).reply(200, {id: projectId, organizationId})
    mockApi({apiVersion: 'vX', query, uri: '/blueprints/resources/search'})
      .matchHeader('x-sanity-scope-type', 'organization')
      .matchHeader('x-sanity-scope-id', organizationId)
      .reply(200, [{stackId}])
    mockApi({apiVersion: 'vX', uri: `/blueprints/stacks/${stackId}`})
      .matchHeader('x-sanity-scope-type', 'organization')
      .matchHeader('x-sanity-scope-id', organizationId)
      .reply(200, {name: 'Organization Stack'})

    const {error} = await testCommand(CorsDelete, [origin])
    expect(error?.message).toContain(
      `Blueprint Stack "Organization Stack" manages CORS origin "${origin}"`,
    )
  })

  test('allows a change when a local reference exists and the ownership lookup finds no owner', async () => {
    await selectProfile([
      {...dataset, lifecycle: {ownershipAction: {stack: 'other-stack', type: 'reference'}}},
    ])
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    }).reply(200, [{aclMode: 'public', name: datasetName}])
    mockApi({
      apiVersion: 'vX',
      query: {id: `${projectId}:${datasetName}`, type: 'sanity.project.dataset'},
      uri: '/blueprints/resources/search',
    }).reply(200, [])
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId,
      uri: `/projects/${projectId}`,
    }).reply(200, {id: projectId, organizationId: null})
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      method: 'patch',
      projectId,
      uri: `/datasets/${datasetName}`,
    }).reply(200, {datasetName})

    const {error, stdout} = await testCommand(DatasetVisibilitySetCommand, [datasetName, 'private'])
    expect(error).toBeUndefined()
    expect(stdout).toContain('Dataset visibility changed')
  })

  test('refuses a mutation when Stack ownership cannot be verified', async () => {
    await selectProfile()
    mockApi({
      apiVersion: DATASET_API_VERSION,
      includeQueryTag: false,
      projectId,
      uri: '/datasets',
    }).reply(200, [{aclMode: 'public', name: datasetName}])
    mockApi({
      apiVersion: 'vX',
      query: {id: `${projectId}:${datasetName}`, type: 'sanity.project.dataset'},
      uri: '/blueprints/resources/search',
    }).reply(503)

    const {error} = await testCommand(DatasetVisibilitySetCommand, [datasetName, 'private'])
    expect(error?.message).toContain('Could not verify Blueprint ownership for dataset "preview"')
    expect(error?.message).toContain('Run `sanity debug` to verify the active target.')
  })

  test.each(['project', 'organization'] as const)(
    'qualifies the ID before checking ownership of a %s robot',
    async (scope) => {
      await selectProfile()
      const scopeId = scope === 'project' ? projectId : 'org-123'
      mockApi({
        apiVersion: 'vX',
        query: {id: `${scopeId}:robot-id`, type: 'sanity.access.robot'},
        uri: '/blueprints/resources/search',
      })
        .matchHeader('x-sanity-scope-type', scope)
        .matchHeader('x-sanity-scope-id', scopeId)
        .reply(200, [{stackId}])
      mockApi({apiVersion: 'vX', uri: `/blueprints/stacks/${stackId}`}).reply(200, {
        name: 'Robot Stack',
      })

      const {error} = await testCommand(DeleteTokensCommand, [
        'robot-id',
        '--yes',
        `--${scope}`,
        scopeId,
      ])
      expect(error?.message).toContain('Blueprint Stack "Robot Stack" manages API token "robot-id"')
    },
  )
})

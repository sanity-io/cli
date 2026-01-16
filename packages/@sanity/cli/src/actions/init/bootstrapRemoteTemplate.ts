import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'

import {Output, subdebug} from '@sanity/cli-core'
import {logSymbols, spinner} from '@sanity/cli-core/ux'
import {getMonoRepo, GitHubFileReader, validateTemplate} from '@sanity/template-validator'
import {type Framework, frameworks} from '@vercel/frameworks'
import {detectFrameworkRecord, LocalFileSystemDetector} from '@vercel/fs-detectors'

import {createCorsOrigin} from '../../services/cors.js'
import {createToken} from '../../services/tokens.js'
import {getDefaultPortForFramework} from '../../util/frameworkPort.js'
import {type GenerateConfigOptions} from './createStudioConfig.js'
import {tryGitInit} from './git.js'
import {
  applyEnvVariables,
  checkIfNeedsApiToken,
  downloadAndExtractRepo,
  getGitHubRawContentUrl,
  type RepoInfo,
  tryApplyPackageName,
} from './remoteTemplate.js'
import {updateInitialTemplateMetadata} from './updateInitialTemplateMetadata.js'

const debug = subdebug('init:bootstrapRemoteTemplate')

export interface BootstrapRemoteOptions {
  output: Output
  outputPath: string
  packageName: string
  repoInfo: RepoInfo
  variables: GenerateConfigOptions['variables']

  bearerToken?: string
}

const SANITY_DEFAULT_PORT = 3333
const READ_TOKEN_LABEL = 'Live Preview API'
const WRITE_TOKEN_LABEL = 'App Write Token'
const INITIAL_COMMIT_MESSAGE = 'Initial commit from Sanity CLI'
const API_READ_TOKEN_ROLE = 'viewer'
const API_WRITE_TOKEN_ROLE = 'editor'

export async function bootstrapRemoteTemplate(opts: BootstrapRemoteOptions): Promise<void> {
  const {bearerToken, output, outputPath, packageName, repoInfo, variables} = opts
  const name = [repoInfo.username, repoInfo.name, repoInfo.filePath].filter(Boolean).join('/')
  const contentsUrl = getGitHubRawContentUrl(repoInfo)
  const headers: Record<string, string> = {}
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`
  }
  const spin = spinner(`Bootstrapping files from template "${name}"`).start()
  const corsAdded: number[] = [SANITY_DEFAULT_PORT]

  debug('Validating remote template')
  const fileReader = new GitHubFileReader(contentsUrl, headers)
  const packages = await getMonoRepo(fileReader)
  const validation = await validateTemplate(fileReader, packages)
  if (!validation.isValid) {
    throw new Error(validation.errors.join('\n'))
  }

  debug('Create new directory "%s"', outputPath)
  await mkdir(outputPath, {recursive: true})

  debug('Downloading and extracting repo to %s', outputPath)
  await downloadAndExtractRepo(outputPath, repoInfo, bearerToken)

  debug('Checking if template needs read token')
  const needsReadToken = await Promise.all(
    (packages ?? ['']).map((pkg) => checkIfNeedsApiToken(join(outputPath, pkg), 'read')),
  ).then((results) => results.some(Boolean))
  const needsWriteToken = await Promise.all(
    (packages ?? ['']).map((pkg) => checkIfNeedsApiToken(join(outputPath, pkg), 'write')),
  ).then((results) => results.some(Boolean))

  debug('Applying environment variables')
  const readToken = needsReadToken
    ? (
        await createToken({
          label: READ_TOKEN_LABEL,
          projectId: variables.projectId,
          roleName: API_READ_TOKEN_ROLE,
        })
      ).key
    : undefined
  const writeToken = needsWriteToken
    ? (
        await createToken({
          label: WRITE_TOKEN_LABEL,
          projectId: variables.projectId,
          roleName: API_WRITE_TOKEN_ROLE,
        })
      ).key
    : undefined

  for (const pkg of packages ?? ['']) {
    const packagePath = join(outputPath, pkg)
    const packageFramework: Framework | null = await detectFrameworkRecord({
      frameworkList: frameworks as readonly Framework[],
      fs: new LocalFileSystemDetector(packagePath),
    })

    const port = getDefaultPortForFramework(packageFramework?.slug)
    if (corsAdded.includes(port)) {
      debug('Setting CORS origin to http://localhost:%d', port)
      await createCorsOrigin({
        allowCredentials: true,
        origin: `http://localhost:${port}`,
        projectId: variables.projectId,
      })
      corsAdded.push(port)
    }

    debug('Applying environment variables to %s', pkg)
    // Next.js uses `.env.local` for local environment variables
    const envName = packageFramework?.slug === 'nextjs' ? '.env.local' : '.env'
    await applyEnvVariables(packagePath, {...variables, readToken, writeToken}, envName)
  }

  debug('Setting package name to %s', packageName)
  await tryApplyPackageName(outputPath, packageName)

  debug('Initializing git repository')
  tryGitInit(outputPath, INITIAL_COMMIT_MESSAGE)

  debug('Updating initial template metadata')
  await updateInitialTemplateMetadata(variables.projectId, `external-${name}`)

  spin.succeed()
  if (corsAdded.length > 0) {
    output.log(
      `${logSymbols.success} CORS origins added (${corsAdded.map((p) => `localhost:${p}`).join(', ')})`,
    )
  }
  if (readToken) output.log(`${logSymbols.success} API token generated (${READ_TOKEN_LABEL})`)
  if (writeToken) output.log(`${logSymbols.success} API token generated (${WRITE_TOKEN_LABEL})`)
}

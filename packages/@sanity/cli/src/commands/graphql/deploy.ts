import {Flags} from '@oclif/core'
import {isInteractive, SanityCommand} from '@sanity/cli-core'
import {confirm, spinner} from '@sanity/cli-core/ux'
import {get} from 'lodash-es'

import {extractFromSanitySchema} from '../../actions/graphql/extractFromSanitySchema.js'
import gen1 from '../../actions/graphql/gen1/index.js'
import gen2 from '../../actions/graphql/gen2/index.js'
import gen3 from '../../actions/graphql/gen3/index.js'
import {getGraphQLAPIs} from '../../actions/graphql/getGraphQLAPIs.js'
import {graphqlDebug} from '../../actions/graphql/graphqlDebug.js'
import {resolveApiGeneration} from '../../actions/graphql/resolveApiGeneration.js'
import {SchemaError} from '../../actions/graphql/SchemaError.js'
import {
  type GeneratedApiSpecification,
  type ResolvedGraphQLAPI,
  type ValidationResponse,
} from '../../actions/graphql/types.js'
import {
  deployGraphQLAPI,
  getClientUrl,
  getCurrentSchemaProps,
  validateGraphQLAPI,
} from '../../services/graphql.js'

interface DeployTask {
  dataset: string
  enablePlayground: boolean
  projectId: string
  schema: GeneratedApiSpecification
  tag: string
}

const apiIdRegex = /^[a-z0-9_-]+$/
const generations = {
  gen1,
  gen2,
  gen3,
}

const ignoredBreaking = new Set<string>(['OPTIONAL_INPUT_FIELD_ADDED'])
// Reserved for future use to filter out specific dangerous change types
const ignoredWarnings = new Set<string>()

const debug = graphqlDebug.extend('deploy')

export class GraphQLDeployCommand extends SanityCommand<typeof GraphQLDeployCommand> {
  static override description = 'Deploy a GraphQL API from the current Sanity schema'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Deploy all defined GraphQL APIs',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --dry-run',
      description: 'Validate defined GraphQL APIs, check for breaking changes, skip deploy',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --api staging --api ios',
      description: 'Deploy only the GraphQL APIs with the IDs "staging" and "ios"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --playground',
      description: 'Deploy all defined GraphQL APIs, overriding any playground setting',
    },
  ]

  static override flags = {
    api: Flags.string({
      description: 'Only deploy API with this ID. Can be specified multiple times.',
      multiple: true,
    }),
    dataset: Flags.string({
      description: 'Deploy API for the given dataset',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Validate defined GraphQL APIs, check for breaking changes, skip deploy',
    }),
    force: Flags.boolean({
      description: 'Deploy API without confirming breaking changes',
    }),
    generation: Flags.string({
      description: 'API generation to deploy (defaults to "gen3")',
      options: ['gen1', 'gen2', 'gen3'],
    }),
    'non-null-document-fields': Flags.boolean({
      description: 'Use non-null document fields (_id, _type etc)',
    }),
    playground: Flags.boolean({
      allowNo: true,
      description: 'Enable GraphQL playground for easier debugging',
    }),
    tag: Flags.string({
      description: 'Deploy API(s) to given tag (defaults to "default")',
    }),
    'with-union-cache': Flags.boolean({
      description:
        'Enable union cache that optimizes schema generation for schemas with many self referencing types',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(GraphQLDeployCommand)
    const {
      api: onlyApis,
      dataset: datasetFlag,
      'dry-run': dryRun,
      generation: generationFlag,
      'non-null-document-fields': nonNullDocumentFieldsFlag,
      playground: playgroundFlag,
      tag: tagFlag,
      'with-union-cache': withUnionCache,
    } = flags

    const workDir = (await this.getProjectRoot()).directory

    let apiDefs: ResolvedGraphQLAPI[] = []
    let spin: ReturnType<typeof spinner>

    try {
      apiDefs = await getGraphQLAPIs(workDir)
    } catch (error) {
      debug('Failed to get GraphQL APIs', error)
      this.error('Failed to get GraphQL APIs', {exit: 1})
    }

    const hasMultipleApis = flags.api ? flags.api.length > 1 : apiDefs.length > 1

    const usedFlags = [
      datasetFlag && '--dataset',
      tagFlag && '--tag',
      playgroundFlag !== undefined && '--playground',
      generationFlag !== undefined && '--generation',
      nonNullDocumentFieldsFlag !== undefined && '--non-null-document-fields',
    ].filter(Boolean)

    if (hasMultipleApis && usedFlags.length > 0) {
      this.warn(`More than one API defined, and ${usedFlags.join('/')} is specified`)
      this.warn(`This will use the specified flag(s) for ALL APIs, overriding config!`)

      if (flags.force) {
        this.warn(`--force specified, continuing...`)
      } else if (
        !(await confirm({
          default: false,
          message: 'Continue with flag overrides for all APIs?',
        }))
      ) {
        this.error('Operation cancelled', {exit: 1})
      }
    }

    const deployTasks: DeployTask[] = []

    for (const apiId of onlyApis || []) {
      if (!apiDefs.some((apiDef) => apiDef.id === apiId)) {
        this.error(`GraphQL API with id "${apiId}" not found`, {exit: 1})
      }
    }

    const apiNames = new Set<string>()
    const apiIds = new Set<string>()

    for (const apiDef of apiDefs) {
      if (onlyApis && (!apiDef.id || !onlyApis.includes(apiDef.id))) {
        continue
      }

      const {apiName} = this.getApiIdentifiers(apiDef, datasetFlag, tagFlag)
      if (apiNames.has(apiName)) {
        this.error(`Multiple GraphQL APIs with the same dataset and tag found (${apiName})`, {
          exit: 1,
        })
      }

      if (apiDef.id) {
        if (typeof apiDef.id !== 'string' || !apiIdRegex.test(apiDef.id)) {
          this.error(
            `Invalid GraphQL API id "${apiDef.id}" - only a-z, 0-9, underscore and dashes are allowed`,
            {exit: 1},
          )
        }

        if (apiIds.has(apiDef.id)) {
          this.error(`Multiple GraphQL APIs with the same ID found (${apiDef.id})`, {exit: 1})
        }

        apiIds.add(apiDef.id)
      }

      apiNames.add(apiName)
    }

    if (onlyApis) {
      this.warn(`Deploying only specified APIs: ${onlyApis.join(', ')}`)
    }

    let index = -1
    for (const apiDef of apiDefs) {
      if (onlyApis && (!apiDef.id || !onlyApis.includes(apiDef.id))) {
        continue
      }

      index++

      const {apiName, dataset, tag} = this.getApiIdentifiers(apiDef, datasetFlag, tagFlag)
      const {nonNullDocumentFields, playground, projectId, schema} = apiDef
      spin = spinner(`Generating GraphQL API: ${apiName}`).start()

      if (!dataset) {
        spin.fail()
        this.error(`No dataset specified for API at index ${index}`, {exit: 1})
      }

      const {currentGeneration, playgroundEnabled} = await getCurrentSchemaProps(
        projectId,
        dataset,
        tag,
      )

      // CLI flag takes precedence over configuration
      const specifiedGeneration = generationFlag === undefined ? apiDef.generation : generationFlag

      const generation = await resolveApiGeneration({
        currentGeneration,
        force: flags.force,
        index,
        output: this.output,
        specifiedGeneration,
      })

      if (!generation) {
        // User cancelled
        spin.fail()
        continue
      }

      if (!this.isRecognizedApiGeneration(generation)) {
        spin.fail()
        this.error(`Unknown API generation "${generation}" for API at index ${index}`, {exit: 1})
      }

      const enablePlayground = await this.shouldEnablePlayground({
        dryRun,
        playgroundCliFlag: playgroundFlag,
        playgroundConfiguration: playground,
        playgroundCurrentlyEnabled: playgroundEnabled,
        spin,
      })

      let apiSpec: GeneratedApiSpecification
      try {
        const generateSchema = generations[generation]
        const extracted = extractFromSanitySchema(schema, {
          // Allow CLI flag to override configured setting
          nonNullDocumentFields:
            nonNullDocumentFieldsFlag === undefined
              ? nonNullDocumentFields
              : nonNullDocumentFieldsFlag,
          withUnionCache,
        })

        apiSpec = generateSchema(extracted, {filterSuffix: apiDef.filterSuffix})
      } catch (err) {
        debug('extractFromSanitySchema error', err)
        spin.fail()

        if (err instanceof SchemaError) {
          err.print(this.output)
          process.exitCode = 1
        }

        this.error('Failed to generate GraphQL API', {exit: 1})
      }

      let valid: ValidationResponse | undefined
      try {
        valid = await validateGraphQLAPI({
          dataset,
          enablePlayground,
          projectId,
          schema: apiSpec,
          tag,
        })
      } catch (err) {
        debug('validateGraphQLAPI error', err)
        const validationError = get(err, 'response.body.validationError')
        spin.fail()
        this.error(validationError ?? 'Failed to validate GraphQL API', {exit: 1})
      }

      // when the result is not valid and there are breaking changes afoot!
      if (!this.isResultValid(valid, {force: flags.force, spin})) {
        // not valid and a dry run? then it can exit with a error
        if (dryRun) {
          spin.fail()
          this.renderBreakingChanges(valid)
          process.exitCode = 1
          continue
        }

        if (!isInteractive()) {
          spin.fail()
          this.renderBreakingChanges(valid)
          this.error(
            'Dangerous changes found - falling back. Re-run the command with the `--force` flag to force deployment.',
            {exit: 1},
          )
        }

        spin.stop()
        this.renderBreakingChanges(valid)
        const shouldDeploy = await confirm({
          default: false,
          message: 'Do you want to deploy a new API despite the dangerous changes?',
        })

        if (!shouldDeploy) {
          spin.fail()
          continue
        }

        spin.succeed()
      } else if (dryRun) {
        spin.succeed()
        this.output.log('GraphQL API is valid and has no breaking changes')
        continue
      }

      deployTasks.push({
        dataset,
        enablePlayground,
        projectId,
        schema: apiSpec,
        tag,
      })
    }

    // Give some space for deployment tasks
    this.output.log('')

    for (const task of deployTasks) {
      const {dataset, enablePlayground, projectId, schema, tag} = task

      this.output.log(`Project: ${projectId}`)
      this.output.log(`Dataset: ${dataset}`)
      this.output.log(`Tag:     ${tag}`)

      spin = spinner('Deploying GraphQL API').start()

      try {
        const response = await deployGraphQLAPI({
          dataset,
          enablePlayground,
          projectId,
          schema,
          tag,
        })

        spin.stop()
        const apiUrl = await getClientUrl(
          projectId,
          response.location.replace(/^\/(v1|v\d{4}-\d{2}-\d{2})\//, '/'),
        )
        this.output.log(`URL:     ${apiUrl}`)
        spin.start('Deployed!').succeed()
        this.output.log('')
      } catch (error) {
        spin.fail()
        debug('Failed to deploy GraphQL API', error)
        this.error('Failed to deploy GraphQL API', {exit: 1})
      }
    }
  }

  private filterChanges(valid: ValidationResponse) {
    const {breakingChanges: breaking, dangerousChanges: dangerous} = valid
    return {
      breakingChanges: breaking.filter((change) => !ignoredBreaking.has(change.type)),
      dangerousChanges: dangerous.filter((change) => !ignoredWarnings.has(change.type)),
    }
  }

  private getApiIdentifiers(apiDef: ResolvedGraphQLAPI, datasetFlag?: string, tagFlag?: string) {
    const dataset = datasetFlag || apiDef.dataset
    const tag = tagFlag || apiDef.tag || 'default'
    const apiName = [dataset, tag].join('/')
    return {apiName, dataset, tag}
  }

  private isRecognizedApiGeneration(generation: string): generation is 'gen1' | 'gen2' | 'gen3' {
    return ['gen1', 'gen2', 'gen3'].includes(generation)
  }

  private isResultValid(
    valid: ValidationResponse,
    {force, spin}: {force?: boolean; spin: ReturnType<typeof spinner>},
  ) {
    const {validationError} = valid
    if (validationError) {
      spin.fail()
      this.error(`GraphQL schema is not valid:\n\n${validationError}`, {exit: 1})
    }

    const {breakingChanges, dangerousChanges} = this.filterChanges(valid)

    const hasProblematicChanges = breakingChanges.length > 0 || dangerousChanges.length > 0

    if (!hasProblematicChanges) {
      spin.succeed()
      return true
    }

    if (force) {
      spin.text = 'Validating GraphQL API: Dangerous changes. Forced with `--force`.'
      spin.warn()
      return true
    }

    spin.warn()
    return false
  }

  private renderBreakingChanges(valid: ValidationResponse) {
    const {breakingChanges, dangerousChanges} = this.filterChanges(valid)

    if (dangerousChanges.length > 0) {
      this.output.log('\nFound potentially dangerous changes from previous schema:')
      for (const change of dangerousChanges) this.output.log(` - ${change.description}`)
    }

    if (breakingChanges.length > 0) {
      this.output.log('\nFound BREAKING changes from previous schema:')
      for (const change of breakingChanges) this.output.log(` - ${change.description}`)
    }

    this.output.log('')
  }

  private async shouldEnablePlayground({
    dryRun,
    playgroundCliFlag,
    playgroundConfiguration,
    playgroundCurrentlyEnabled,
    spin,
  }: {
    dryRun: boolean
    playgroundCliFlag?: boolean
    playgroundConfiguration?: boolean
    playgroundCurrentlyEnabled?: boolean
    spin: ReturnType<typeof spinner>
  }): Promise<boolean> {
    // On a dry run, it doesn't matter, return true 🤷‍♂️
    if (dryRun) {
      return true
    }

    // Prioritize CLI flag if set
    if (playgroundCliFlag !== undefined) {
      return playgroundCliFlag
    }

    // If explicitly set true/false in configuration, use that
    if (playgroundConfiguration !== undefined) {
      return playgroundConfiguration
    }

    // If API is already deployed, use the current state
    if (playgroundCurrentlyEnabled !== undefined) {
      return playgroundCurrentlyEnabled
    }

    // If no API is deployed, default to true if non-interactive
    if (!isInteractive()) {
      return true
    }

    // Interactive environment, so prompt the user
    const prevText = spin.text
    spin.warn()
    const shouldDeploy = await confirm({
      default: true,
      message: 'Do you want to enable a GraphQL playground?',
    })
    spin.clear().start(prevText)

    return shouldDeploy
  }
}

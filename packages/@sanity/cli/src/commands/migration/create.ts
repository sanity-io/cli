import {existsSync, mkdirSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'

import {confirm, input, select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {findProjectRoot, SanityCommand} from '@sanity/cli-core'
import chalk from 'chalk'
import {deburr} from 'lodash-es'

import {MIGRATIONS_DIRECTORY} from '../../actions/migration/constants.js'
import {minimalAdvanced} from '../../actions/migration/templates/minimalAdvanced.js'
import {minimalSimple} from '../../actions/migration/templates/minimalSimple.js'
import {renameField} from '../../actions/migration/templates/renameField.js'
import {renameType} from '../../actions/migration/templates/renameType.js'
import {stringToPTE} from '../../actions/migration/templates/stringToPTE.js'

const TEMPLATES = [
  {name: 'Minimalistic migration to get you started', template: minimalSimple},
  {name: 'Rename an object type', template: renameType},
  {name: 'Rename a field', template: renameField},
  {name: 'Convert string field to Portable Text', template: stringToPTE},
  {
    name: 'Advanced template using async iterators providing more fine grained control',
    template: minimalAdvanced,
  },
]

export class CreateMigrationCommand extends SanityCommand<typeof CreateMigrationCommand> {
  static override args = {
    title: Args.string({
      description: 'Title of migration',
      required: false,
    }),
  }

  static override description = 'Create a new migration within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a new migration, prompting for title and options',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "Rename field from location to address"',
      description: 'Create a new migration with the provided title, prompting for options',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(CreateMigrationCommand)
    let {title} = args
    const projectRoot = await findProjectRoot(process.cwd())
    const workDir = projectRoot.directory

    if (!title?.trim()) {
      title = await input({
        message: 'Title of migration (e.g. "Rename field from location to address")',
        validate: (value) => {
          if (!value.trim()) {
            return 'Title cannot be empty'
          }
          return true
        },
      })
    }

    const types = await input({
      message:
        'Type of documents to migrate. You can add multiple types separated by comma (optional)',
    })

    const templatesByName = Object.fromEntries(TEMPLATES.map((t) => [t.name, t]))
    const template = await select({
      choices: TEMPLATES.map((definedTemplate) => ({
        name: definedTemplate.name,
        value: definedTemplate.name,
      })),
      message: 'Select a template',
    })
    const renderedTemplate = (templatesByName[template].template || minimalSimple)({
      documentTypes: types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      migrationName: title,
    })

    const sluggedName = deburr(title.toLowerCase())
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^a-z0-9-]/g, '')
    const destDir = path.join(workDir, MIGRATIONS_DIRECTORY, sluggedName)
    const definitionFile = path.join(destDir, 'index.ts')

    await this.createDirectory(destDir)

    await writeFile(definitionFile, renderedTemplate)
    // To dry run it, run \`sanity migration run ${sluggedName}\``)
    this.log()
    this.log(`${chalk.green('✓')} Migration created!`)
    this.log()
    this.log('Next steps:')
    this.log(
      `Open ${chalk.bold(
        definitionFile,
      )} in your code editor and write the code for your migration.`,
    )
    this.log(
      `Dry run the migration with:\n\`${chalk.bold(
        `sanity migration run ${sluggedName} --project=<projectId> --dataset <dataset> `,
      )}\``,
    )
    this.log(
      `Run the migration against a dataset with:\n \`${chalk.bold(
        `sanity migration run ${sluggedName} --project=<projectId> --dataset <dataset> --no-dry-run`,
      )}\``,
    )
    this.log()
    this.log(
      `👉 Learn more about schema and content migrations at ${chalk.bold(
        'https://www.sanity.io/docs/schema-and-content-migrations',
      )}`,
    )
  }

  private async createDirectory(destDir: string): Promise<void> {
    if (existsSync(destDir)) {
      const shouldOverwriteDir = await confirm({
        default: false,
        message: `Migration directory ${chalk.cyan(destDir)} already exists. Overwrite?`,
      })

      if (!shouldOverwriteDir) return
    }
    mkdirSync(destDir, {recursive: true})
  }
}

import {access, mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {confirm, input, select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import chalk from 'chalk'
import {deburr} from 'lodash-es'

import {getMigrationRootDirectory} from '../../actions/migration/getMigrationRootDirectory.js'
import {
  minimalAdvanced,
  minimalSimple,
  renameField,
  renameType,
  stringToPTE,
} from '../../actions/migration/templates/index.js'
import {MIGRATIONS_DIRECTORY} from '../../util/migration/constants.js'

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
    const workDir = await getMigrationRootDirectory(this.output)

    const title = await this.promptForTitle(args.title)
    const types = await this.promptForDocumentTypes()
    const {template} = await this.promptForTemplate()

    const renderedTemplate = (template || minimalSimple)({
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

    const dirCreated = await this.createMigrationFile(destDir, definitionFile, renderedTemplate)

    if (dirCreated) {
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
  }

  private async createMigrationFile(
    destDir: string,
    definitionFile: string,
    renderedTemplate: string,
  ): Promise<boolean> {
    const dirExists = await access(destDir)
      .then(() => true)
      .catch(() => false)

    if (dirExists) {
      const shouldOverwrite = await this.promptForOverwrite(destDir)
      if (!shouldOverwrite) return false
    }

    try {
      await mkdir(destDir, {recursive: true})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create migration directory: ${message}`, {exit: 1})
    }

    try {
      await writeFile(definitionFile, renderedTemplate)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create migration file: ${message}`, {exit: 1})
    }

    return true
  }

  private async promptForDocumentTypes(): Promise<string> {
    return input({
      message:
        'Type of documents to migrate. You can add multiple types separated by comma (optional)',
    })
  }

  private async promptForOverwrite(destDir: string): Promise<boolean> {
    return confirm({
      default: false,
      message: `Migration directory ${chalk.cyan(destDir)} already exists. Overwrite?`,
    })
  }

  private async promptForTemplate(): Promise<{
    name: string
    template: (params: {documentTypes: string[]; migrationName: string}) => string
  }> {
    const templatesByName = Object.fromEntries(TEMPLATES.map((t) => [t.name, t]))
    const templateName = await select({
      choices: TEMPLATES.map((definedTemplate) => ({
        name: definedTemplate.name,
        value: definedTemplate.name,
      })),
      message: 'Select a template',
    })

    return templatesByName[templateName]
  }

  private async promptForTitle(providedTitle?: string): Promise<string> {
    if (providedTitle?.trim()) {
      return providedTitle
    }

    return input({
      message: 'Title of migration (e.g. "Rename field from location to address")',
      validate: (value) => {
        if (!value.trim()) {
          return 'Title cannot be empty'
        }

        return true
      },
    })
  }
}

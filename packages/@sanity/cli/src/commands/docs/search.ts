import {select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'
import chalk from 'chalk'

import {readDoc, searchDocs, type SearchResult} from '../../services/docs.js'

const searchDebug = subdebug('docs:search')

export class DocsSearchCommand extends SanityCommand<typeof DocsSearchCommand> {
  static override args = {
    query: Args.string({
      description: 'Search query for documentation',
      required: true,
    }),
  }

  static override description = 'Search Sanity docs'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> schema',
      description: 'Search for documentation about schemas',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "groq functions"',
      description: 'Search with phrase',
    },
    {
      command: '<%= config.bin %> <%= command.id %> "deployment" --limit=5',
      description: 'Limit search results',
    },
  ]

  static override flags = {
    limit: Flags.integer({
      default: 10,
      description: 'Maximum number of results to return',
      min: 1,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DocsSearchCommand)
    const {query} = args
    const {limit} = flags

    this.log(`Searching documentation for: "${query}"`)

    let results: SearchResult[]
    try {
      results = await searchDocs({
        limit,
        query,
      })

      if (results.length === 0) {
        this.log('No results found. Try a different search term.')
        return
      }
    } catch (error) {
      searchDebug('error fetching results', error)
      const message =
        error instanceof Error
          ? error.message
          : 'The documentation search API is currently unavailable. Please try again later.'
      this.error(message, {
        exit: 1,
      })
    }

    this.log(`\nFound ${results.length} result(s):\n`)

    for (const [index, result] of results.entries()) {
      this.log(`${index + 1}. ${result.title}`)
      this.log(`   ${chalk.cyan(`URL: https://www.sanity.io${result.path}`)}`)
      if (result.description) {
        this.log(`   ${result.description}`)
      }
      this.log('')
    }

    // Show usage hint in non-interactive mode
    if (!isInteractive()) {
      this.log('Use `sanity docs read <url>` to read an article in terminal.')
      this.log('Use `sanity docs read <path>` to follow links found within articles.')
      this.log('')
      return
    }

    // Interactive selection (only in interactive environments)
    if (results.length > 0) {
      const choices = results.map((result, index) => ({
        description: result.description,
        name: `${index + 1}. ${result.title} (${result.path})`,
        value: index,
      }))

      try {
        const selectedIndex = await select({
          choices: [...choices, {description: 'Exit without reading', name: 'Exit', value: -1}],
          message: 'Select an article to read in terminal:',
        })

        if (typeof selectedIndex === 'number' && selectedIndex >= 0) {
          const selected = results[selectedIndex]

          try {
            // Read and display the article
            const content = await readDoc({path: selected.path})
            this.log('\n---\n')
            this.log(content)
          } catch (error) {
            this.error(
              `Failed to read article: ${error instanceof Error ? error.message : 'Unknown error'}`,
              {
                exit: 1,
              },
            )
          }
        }
      } catch {
        this.error('Failed to read article', {exit: 1})
      }
    }
  }
}

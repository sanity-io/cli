import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import open from 'open'

import {normalizeDocsPath} from '../../actions/docs/normalizeDocsPath.js'
import {readDoc} from '../../services/docs.js'

export class DocsReadCommand extends SanityCommand<typeof DocsReadCommand> {
  static override args = {
    path: Args.string({
      description: 'Path or URL to article, found in search results and docs content as links',
      required: true,
    }),
  }

  static override description = 'Read an article in terminal'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> /docs/studio/installation',
      description: 'Read as markdown in terminal',
    },
    {
      command: '<%= config.bin %> <%= command.id %> https://www.sanity.io/docs/studio/installation',
      description: 'Read using full URL',
    },
    {
      command: '<%= config.bin %> <%= command.id %> /docs/studio/installation --web',
      description: 'Open in web browser',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> https://www.sanity.io/docs/studio/installation -w',
      description: 'Open using full URL in web browser',
    },
  ]

  static override flags = {
    web: Flags.boolean({
      aliases: ['w'],
      description: 'Open in a web browser',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DocsReadCommand)
    const {path: input} = args
    const {web} = flags

    // Normalize URL to path
    const path = normalizeDocsPath(input)

    // Validate the normalized path
    if (!path.startsWith('/')) {
      this.error(
        'Invalid path or URL. Expected a Sanity docs path or URL.\nExamples:\n  /docs/studio/installation\n  https://www.sanity.io/docs/studio/installation',
        {
          exit: 1,
        },
      )
    }

    // Enhanced validation for security and correctness
    if (path.includes('..') || !path.startsWith('/docs/')) {
      this.error(
        'Invalid path. Must be a valid Sanity docs path starting with /docs/\nExample: /docs/studio/installation',
        {
          exit: 1,
        },
      )
    }

    // Open in web browser if --web or -w flag is provided
    if (web) {
      const url = `https://www.sanity.io${path}`
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    // Default behavior: read as markdown in terminal
    this.log(`Reading article: ${path}`)

    try {
      const content = await readDoc({path})
      this.log('\n---\n')
      this.log(content)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Failed to read article', {
        exit: 1,
      })
    }
  }
}

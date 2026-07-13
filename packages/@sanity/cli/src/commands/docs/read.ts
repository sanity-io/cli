import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import open from 'open'

import {readDoc} from '../../services/docs.js'

interface DocsInput {
  readPath: string
  webPath: string
}

function isSanityHostname(hostname: string): boolean {
  return hostname === 'sanity.io' || hostname.endsWith('.sanity.io')
}

function parseDocsInput(input: string): DocsInput {
  try {
    const url = new URL(input)

    if (isSanityHostname(url.hostname)) {
      return {readPath: url.pathname, webPath: `${url.pathname}${url.search}${url.hash}`}
    }
  } catch {
    // Input is not an absolute URL.
  }

  if (input.startsWith('/') && !input.startsWith('//')) {
    const url = new URL(input, 'https://www.sanity.io')

    return {readPath: url.pathname, webPath: `${url.pathname}${url.search}${url.hash}`}
  }

  return {readPath: input, webPath: input}
}

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
    web: Flags.boolean({aliases: ['w'], description: 'Open in a web browser'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DocsReadCommand)
    const {path: input} = args
    const {web} = flags

    const {readPath, webPath} = parseDocsInput(input)

    if (!readPath.startsWith('/')) {
      this.error(
        'Invalid path or URL. Expected a Sanity docs path or URL.\nExamples:\n  /docs/studio/installation\n  https://www.sanity.io/docs/studio/installation',
        {exit: 2},
      )
    }

    if (readPath.includes('..') || !readPath.startsWith('/docs/')) {
      this.error(
        'Invalid path. Must be a valid Sanity docs path starting with /docs/\nExample: /docs/studio/installation',
        {exit: 2},
      )
    }

    if (web) {
      const url = `https://www.sanity.io${webPath}`
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    this.log(`Reading article: ${readPath}`)

    try {
      const content = await readDoc({path: readPath})
      this.log('\n---\n')
      this.log(content)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Failed to read article', {exit: 1})
    }
  }
}

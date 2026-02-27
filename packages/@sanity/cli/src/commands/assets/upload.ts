import {readFile} from 'node:fs/promises'
import {basename, extname} from 'node:path'

import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, SanityCommand} from '@sanity/cli-core'

const IMAGE_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])

export class AssetsUploadCommand extends SanityCommand<typeof AssetsUploadCommand> {
  static override args = {
    file: Args.string({
      description: 'File(s) to upload',
    }),
  }

  static override description = 'Upload files to Sanity CDN and print public URLs.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> screenshot.png',
      description: 'Upload a single image',
    },
    {
      command: '<%= config.bin %> <%= command.id %> screenshot.png report.pdf',
      description: 'Upload multiple files',
    },
  ]

  static override flags = {
    dataset: Flags.string({
      description: 'Dataset name (default: from sanity.config or "production")',
      env: 'SANITY_DATASET',
    }),
    project: Flags.string({
      description: 'Project ID (default: from sanity.config)',
      env: 'SANITY_PROJECT_ID',
    }),
  }

  // Allow multiple positional args (file paths)
  static override strict = false

  async run() {
    const {argv, flags} = await this.parse(AssetsUploadCommand)
    const files = argv as string[]

    if (files.length === 0) {
      this.error('No files specified', {exit: 1})
    }

    // Resolve config once — may fail if run outside a Sanity project directory
    const cliConfig = await this.getCliConfig().catch(() => {})

    // Resolve project ID: --project flag > env > sanity.config.ts in cwd
    // Note: we read from cliConfig directly instead of using this.getProjectId()
    // because getProjectId() calls getCliConfig() → findProjectRoot() which throws
    // when run outside a Sanity project directory, even if --project is provided.
    const projectId = flags.project || cliConfig?.api?.projectId
    if (!projectId) {
      this.error(
        'No project ID found. Either run this from a Sanity project directory, ' +
          'or pass --project <id>',
        {exit: 1},
      )
    }

    // Resolve dataset: --dataset flag > env > sanity.config.ts > "production"
    const dataset = flags.dataset || cliConfig?.api?.dataset || 'production'

    // Auth token resolved automatically by getProjectCliClient
    // from SANITY_AUTH_TOKEN env or ~/.config/sanity/config.json (via `sanity login`)
    const client = await getProjectCliClient({
      apiVersion: '2024-01-01',
      dataset,
      projectId,
      requireUser: true, // errors with "You must login first" if no token
    })

    for (const file of files) {
      const ext = extname(file).toLowerCase()
      const filename = basename(file)
      const assetType = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'file'

      let body: Buffer
      try {
        body = await readFile(file)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.error(`Cannot read ${file}: ${message}`, {exit: 1})
      }

      let doc
      try {
        doc = await client.assets.upload(assetType, body, {filename})
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.error(`Failed to upload ${filename}: ${message}`, {exit: 1})
      }

      if (!doc.url) {
        this.error(`No URL in response for ${filename}`, {exit: 1})
      }

      this.log(doc.url)
    }
  }
}

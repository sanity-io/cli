import {readFile} from 'node:fs/promises'
import {basename, extname} from 'node:path'

import {Args, Flags} from '@oclif/core'
import {getProjectCliClient, SanityCommand} from '@sanity/cli-core'

const CONTENT_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export class AssetsUploadCommand extends SanityCommand<typeof AssetsUploadCommand> {
  static override args = {
    file: Args.string({
      description: 'File(s) to upload',
      required: true,
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
    const cliConfig = await this.getCliConfig().catch(() => undefined)

    // Resolve project ID: --project flag > env > sanity.config.ts in cwd
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
      const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'
      const filename = basename(file)
      const isImage = contentType.startsWith('image/')
      const assetType = isImage ? 'images' : 'files'

      let body: Blob
      try {
        const buffer = await readFile(file)
        body = new Blob([buffer], {type: contentType})
      } catch {
        this.error(`File not found: ${file}`, {exit: 1})
      }

      // POST directly to the assets API
      // SanityClient doesn't expose a raw asset upload method that returns the URL,
      // so we use fetch with the client's token and getUrl() for correct host resolution
      const url = client.getUrl(
        `assets/${assetType}/${dataset}?filename=${encodeURIComponent(filename)}`,
      )

      const res = await fetch(url, {
        body,
        headers: {
          Authorization: `Bearer ${client.config().token}`,
          'Content-Type': contentType,
        },
        method: 'POST',
      })

      if (!res.ok) {
        const text = await res.text()
        this.error(`Failed to upload ${filename}: ${res.status} ${text}`, {exit: 1})
      }

      const data = (await res.json()) as {document?: {url?: string}}
      const assetUrl = data.document?.url

      if (!assetUrl) {
        this.error(`No URL in response for ${filename}`, {exit: 1})
      }

      this.log(assetUrl)
    }
  }
}

import {createWriteStream} from 'node:fs'
import {access, mkdir, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {finished} from 'node:stream/promises'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {boxen, confirm, input, select} from '@sanity/cli-core/ux'
import {type DatasetsResponse} from '@sanity/client'
import pMap from 'p-map'
import prettyMs from 'pretty-ms'

import {archiveDir} from '../../actions/backup/archiveDir.js'
import {assertDatasetExists} from '../../actions/backup/assertDatasetExist.js'
import {backupDownloadDebug} from '../../actions/backup/backupDownloadDebug.js'
import {cleanupTmpDir} from '../../actions/backup/cleanupTmpDir.js'
import {downloadAsset} from '../../actions/backup/downloadAsset.js'
import {downloadDocument} from '../../actions/backup/downloadDocument.js'
import {type File, PaginatedGetBackupStream} from '../../actions/backup/fetchNextBackupPage.js'
import {newProgress} from '../../actions/backup/progressSpinner.js'
import {validateDatasetName} from '../../actions/dataset/validateDatasetName.js'
import {promptForDataset} from '../../prompts/promptForDataset.js'
import {type BackupItem, listBackups} from '../../services/backup.js'
import {listDatasets} from '../../services/datasets.js'
import {humanFileSize} from '../../util/humanFileSize.js'
import {isPathDirName} from '../../util/isPathDirName.js'

const DEFAULT_DOWNLOAD_CONCURRENCY = 10
const MAX_DOWNLOAD_CONCURRENCY = 24

interface DownloadBackupOptions {
  backupId: string
  concurrency: number
  datasetName: string
  outDir: string
  outFileName: string
  overwrite: boolean
  projectId: string
}

export class DownloadBackupCommand extends SanityCommand<typeof DownloadBackupCommand> {
  static override args = {
    dataset: Args.string({
      description: 'Dataset name to download backup from',
      required: false,
    }),
  }

  static override description = 'Download a dataset backup to a local file.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively download a backup',
    },
    {
      command: '<%= config.bin %> <%= command.id %> production --backup-id 2024-01-01-backup-1',
      description: 'Download a specific backup for the production dataset',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> production --backup-id 2024-01-01-backup-2 --out /path/to/file',
      description: 'Download backup to a specific file',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> production --backup-id 2024-01-01-backup-3 --out /path/to/file --overwrite',
      description: 'Download backup and overwrite existing file',
    },
  ]

  static override flags = {
    'backup-id': Flags.string({
      description: 'The backup ID to download',
    }),
    concurrency: Flags.integer({
      default: DEFAULT_DOWNLOAD_CONCURRENCY,
      description: `Concurrent number of backup item downloads (max: ${MAX_DOWNLOAD_CONCURRENCY})`,
    }),
    out: Flags.string({
      description: 'The file or directory path the backup should download to',
    }),
    overwrite: Flags.boolean({
      default: false,
      description: 'Allows overwriting of existing backup file',
    }),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(DownloadBackupCommand)
    let {dataset} = args

    const projectId = await this.getProjectId()

    let datasets: DatasetsResponse

    try {
      datasets = await listDatasets(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      backupDownloadDebug(`Failed to list datasets: ${message}`, error)
      this.error(`Failed to list datasets: ${message}`, {exit: 1})
    }

    if (datasets.length === 0) {
      this.error('No datasets found in this project.', {exit: 1})
    }

    if (dataset) {
      assertDatasetExists(datasets, dataset)
    } else {
      dataset = await promptForDataset({allowCreation: false, datasets})
    }

    const opts = await this.prepareBackupOptions(projectId, dataset)
    const outFilePath = path.join(opts.outDir, opts.outFileName)

    this.log(
      boxen(
        `Downloading backup for:

${styleText('bold', 'projectId')}: ${styleText('cyan', opts.projectId)}
${styleText('bold', 'dataset')}: ${styleText('cyan', opts.datasetName)}
${styleText('bold', 'backupId')}: ${styleText('cyan', opts.backupId)}`,
        {
          borderColor: 'cyan',
          borderStyle: 'round',
          padding: 1,
        },
      ),
    )
    this.log('')
    this.log(`Downloading backup to "${styleText('cyan', outFilePath)}"`)

    const start = Date.now()
    const progressSpinner = newProgress('Setting up backup environment...')

    // Create a unique temporary directory to store files before bundling them into the archive at outputPath.
    // Temporary directories are normally deleted at the end of backup process, any unexpected exit may leave them
    // behind, hence it is important to create a unique directory for each attempt.
    const tmpOutDir = await mkdtemp(path.join(tmpdir(), `sanity-backup-`))

    // Create required directories if they don't exist.
    for (const dir of [
      opts.outDir,
      path.join(tmpOutDir, 'images'),
      path.join(tmpOutDir, 'files'),
    ]) {
      await mkdir(dir, {recursive: true})
    }

    backupDownloadDebug('Writing to temporary directory %s', tmpOutDir)
    const tmpOutDocumentsFile = path.join(tmpOutDir, 'data.ndjson')

    const docOutStream = createWriteStream(tmpOutDocumentsFile)

    try {
      const backupFileStream = new PaginatedGetBackupStream(
        opts.projectId,
        opts.datasetName,
        opts.backupId,
      )

      const files: File[] = []
      let i = 0
      for await (const file of backupFileStream) {
        files.push(file)
        i++
        progressSpinner.set({
          current: i,
          step: `Reading backup files...`,
          total: backupFileStream.totalFiles,
          update: true,
        })
      }

      let totalItemsDownloaded = 0
      await pMap(
        files,
        async (file: File) => {
          if (file.type === 'file' || file.type === 'image') {
            await downloadAsset(file.url, file.name, file.type, tmpOutDir)
          } else {
            const doc = await downloadDocument(file.url)
            docOutStream.write(`${doc}\n`)
          }

          totalItemsDownloaded += 1
          progressSpinner.set({
            current: totalItemsDownloaded,
            step: `Downloading documents and assets...`,
            total: backupFileStream.totalFiles,
            update: true,
          })
        },
        {concurrency: opts.concurrency},
      )
    } catch (error) {
      progressSpinner.fail()
      const message = error instanceof Error ? error.message : String(error)
      backupDownloadDebug(`Downloading dataset backup failed: ${message}`, error)
      this.error(`Downloading dataset backup failed: ${message}`, {exit: 1})
    }

    docOutStream.end()
    await finished(docOutStream)

    progressSpinner.set({step: `Archiving files into a tarball...`, update: true})
    try {
      await archiveDir(tmpOutDir, outFilePath, (processedBytes: number) => {
        progressSpinner.update({
          step: `Archiving files into a tarball, ${humanFileSize(processedBytes)} bytes written...`,
        })
      })
    } catch (err) {
      progressSpinner.fail()
      const message = err instanceof Error ? err.message : String(err)
      backupDownloadDebug(`Archiving backup failed: ${message}`, err)
      this.error(`Archiving backup failed: ${message}`, {exit: 1})
    }

    progressSpinner.set({
      step: `Cleaning up temporary files at ${styleText('cyan', `${tmpOutDir}`)}`,
    })
    await cleanupTmpDir(tmpOutDir)

    progressSpinner.set({
      step: `Backup download complete [${prettyMs(Date.now() - start)}]`,
    })
    progressSpinner.succeed()
  }

  private async getOutputPath(defaultOutFileName: string): Promise<string> {
    if (this.flags.out !== undefined) {
      // Rewrite the output path to an absolute path, if it is not already.
      return path.resolve(this.flags.out)
    }

    const workDir = process.cwd()
    const inputResult = await input({
      default: path.join(workDir, defaultOutFileName),
      message: 'Output path:',
    })
    return path.resolve(inputResult)
  }

  private async prepareBackupOptions(
    projectId: string,
    datasetName: string,
  ): Promise<DownloadBackupOptions> {
    const err = validateDatasetName(datasetName)
    if (err) {
      this.error(err, {exit: 1})
    }

    const backupId = String(
      this.flags['backup-id'] || (await this.promptForBackupId(projectId, datasetName)),
    )

    if (
      'concurrency' in this.flags &&
      (this.flags.concurrency < 1 || this.flags.concurrency > MAX_DOWNLOAD_CONCURRENCY)
    ) {
      this.error(`concurrency should be in 1 to ${MAX_DOWNLOAD_CONCURRENCY} range`, {exit: 1})
    }

    const defaultOutFileName = `${datasetName}-backup-${backupId}.tar.gz`
    let out = await this.getOutputPath(defaultOutFileName)

    // If path is a directory name, then add a default file name to the path.
    if (isPathDirName(out)) {
      out = path.join(out, defaultOutFileName)
    }

    const exists = await access(out).then(
      () => true,
      () => false,
    )
    // If the file already exists, ask for confirmation if it should be overwritten.
    if (!this.flags.overwrite && exists) {
      const shouldOverwrite = await confirm({
        default: false,
        message: `File "${out}" already exists, would you like to overwrite it?`,
      })

      // If the user does not want to overwrite the file, cancel the operation.
      if (!shouldOverwrite) {
        this.error('Operation cancelled.', {exit: 1})
      }
    }

    return {
      backupId,
      concurrency: this.flags.concurrency || DEFAULT_DOWNLOAD_CONCURRENCY,
      datasetName,
      outDir: path.dirname(out),
      outFileName: path.basename(out),
      overwrite: this.flags.overwrite,
      projectId,
    }
  }

  private async promptForBackupId(projectId: string, datasetName: string): Promise<string> {
    const maxBackupIdsShown = 100

    try {
      const response = await listBackups({
        datasetName,
        limit: maxBackupIdsShown,
        projectId,
      })

      if (!response?.backups?.length) {
        this.error('No backups found', {exit: 1})
      }

      const backupIdChoices = response.backups.map((backup: BackupItem) => ({
        name: backup.id,
        value: backup.id,
      }))

      const hint =
        backupIdChoices.length === maxBackupIdsShown
          ? ` (only last ${maxBackupIdsShown} shown)`
          : ''

      return select({
        choices: backupIdChoices,
        message: `Select backup ID to use${hint}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      backupDownloadDebug(`Failed to fetch backups for dataset ${datasetName}: ${message}`, err)
      this.error(`Failed to fetch backups for dataset ${datasetName}: ${message}`, {exit: 1})
    }
  }
}

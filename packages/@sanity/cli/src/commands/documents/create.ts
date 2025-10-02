import {randomUUID} from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {type MultipleMutationResult, type Mutation} from '@sanity/client'
import {watch as chokidarWatch} from 'chokidar'
import {execa, execaSync} from 'execa'
import json5 from 'json5'
import {isEqual, isPlainObject} from 'lodash-es'

import {DOCUMENTS_API_VERSION} from '../../actions/documents/constants.js'
import {getEditor, registerUnlinkOnSigInt} from '../../actions/documents/editor.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {isIdentifiedSanityDocument, isSanityDocumentish} from '../../util/isSanityDocumentish.js'

export type MutationOperationName = 'create' | 'createIfNotExists' | 'createOrReplace'

const createDocumentDebug = subdebug('documents:create')

export class CreateDocumentCommand extends SanityCommand<typeof CreateDocumentCommand> {
  static override args = {
    file: Args.string({
      description: 'JSON file to create document(s) from',
      required: false,
    }),
  }

  static override description = 'Create one or more documents'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> myDocument.json',
      description: 'Create the document specified in "myDocument.json"',
    },
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Open configured $EDITOR and create the specified document(s)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --id myDocId --replace',
      description:
        'Fetch document with the ID "myDocId" and open configured $EDITOR with the current document content (if any). Replace document with the edited version when the editor closes',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --id myDocId --watch --replace --json5',
      description:
        'Open configured $EDITOR and replace the document with the given content on each save. Use JSON5 file extension and parser for simplified syntax.',
    },
  ]

  static override flags = {
    dataset: Flags.string({
      char: 'd',
      description: 'Dataset to create document(s) in (overrides config)',
    }),
    id: Flags.string({
      description:
        'Specify a document ID to use. Will fetch remote document ID and populate editor.',
    }),
    json5: Flags.boolean({
      description: 'Use JSON5 file type to allow a "simplified" version of JSON',
    }),
    missing: Flags.boolean({
      description: "On duplicate document IDs, don't modify the target document(s)",
    }),
    replace: Flags.boolean({
      description:
        'On duplicate document IDs, replace existing document with specified document(s)',
    }),
    watch: Flags.boolean({
      description: 'Write the documents whenever the target file or buffer changes',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(CreateDocumentCommand)
    const {file} = args
    const {dataset, id, json5: useJson5, missing, replace, watch} = flags
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    if (!cliConfig.api?.dataset && !dataset) {
      this.error(
        'No dataset specified. Either configure a dataset in sanity.cli.ts or use the --dataset flag',
        {exit: 1},
      )
    }

    const targetDataset = dataset || cliConfig.api?.dataset

    const client = await this.getProjectApiClient({
      apiVersion: DOCUMENTS_API_VERSION,
      dataset: targetDataset,
      projectId,
      requireUser: true,
    })

    if (replace && missing) {
      this.error('Cannot use both --replace and --missing', {exit: 1})
    }

    if (id && file) {
      this.error('Cannot use --id when specifying a file path', {exit: 1})
    }

    let operation: MutationOperationName = 'create'
    if (replace || missing) {
      operation = replace ? 'createOrReplace' : 'createIfNotExists'
    }

    if (file) {
      try {
        const contentPath = path.resolve(process.cwd(), file)
        const content = json5.parse(await fs.readFile(contentPath, 'utf8'))
        const result = await this.writeDocuments(content, operation, client)
        this.log(this.getResultMessage(result, operation))
        return
      } catch (error) {
        const err = error as Error
        createDocumentDebug(`Error creating documents from file ${file}`, err)
        this.error(`Failed to create documents: ${err.message}`, {exit: 1})
      }
    }

    try {
      // Create a temporary file and use that as source, opening an editor on it
      const docId = id || randomUUID()
      const ext = useJson5 ? 'json5' : 'json'
      // Add UUID prefix to prevent predictable file names and potential conflicts
      const tmpFile = path.join(os.tmpdir(), 'sanity-cli', `${randomUUID()}-${docId}.${ext}`)
      const stringify = useJson5 ? json5.stringify : JSON.stringify
      const defaultValue = (id && (await client.getDocument(id))) || {
        _id: docId,
        _type: 'specify-me',
      }

      // Create temp directory with restricted permissions (owner only)
      const tempDir = path.join(os.tmpdir(), 'sanity-cli')
      await fs.mkdir(tempDir, {
        mode: 0o700, // rwx------ (owner read/write/execute only)
        recursive: true,
      })

      // Write file with restricted permissions (owner read/write only)
      await fs.writeFile(tmpFile, stringify(defaultValue, null, 2), {
        encoding: 'utf8',
        mode: 0o600, // rw------- (owner read/write only)
      })

      const editor = getEditor()
      const readAndPerformCreatesFromFile = this.readAndPerformCreatesFromFile.bind(
        this,
        operation,
        client,
      )

      if (watch) {
        // If we're in watch mode, we want to run the creation on each change (if it validates)
        registerUnlinkOnSigInt(tmpFile)
        this.log(`Watch mode: ${tmpFile}`)
        this.log('Watch mode: Will write documents on each save.')
        this.log('Watch mode: Press Ctrl + C to cancel watch mode.')

        // Add race condition protection
        let isProcessing = false
        chokidarWatch(tmpFile).on('change', async () => {
          if (isProcessing) {
            return // Skip if already processing
          }
          isProcessing = true

          this.log('')
          try {
            await readAndPerformCreatesFromFile(tmpFile, defaultValue)
          } finally {
            isProcessing = false
          }
        })
        execa(editor.bin, [...editor.args, tmpFile], {stdio: 'inherit'})
      } else {
        // While in normal mode, we just want to wait for the editor to close and run the thing once
        execaSync(editor.bin, [...editor.args, tmpFile], {stdio: 'inherit'})
        await readAndPerformCreatesFromFile(tmpFile, defaultValue)
        await fs.unlink(tmpFile).catch(() => {})
      }
    } catch (error) {
      const err = error as Error
      createDocumentDebug('Error in editor workflow', err)
      this.error(`Failed to create documents: ${err.message}`, {exit: 1})
    }
  }

  private getErrorMessage(message: string, index: number, isSingle: boolean): string {
    return isSingle ? `Document ${message}` : `Document at index ${index} ${message}`
  }

  /**
   * Formats the result message for document operations
   */
  private getResultMessage(
    result: MultipleMutationResult,
    operation: MutationOperationName,
  ): string {
    const joiner = '\n  - '
    if (operation === 'createOrReplace') {
      return `Upserted:\n  - ${result.results.map((res) => res.id).join(joiner)}`
    }

    if (operation === 'create') {
      return `Created:\n  - ${result.results.map((res) => res.id).join(joiner)}`
    }

    // "Missing" (createIfNotExists)
    const created: string[] = []
    const skipped: string[] = []
    for (const res of result.results) {
      if (res.operation === 'update') {
        skipped.push(res.id)
      } else {
        created.push(res.id)
      }
    }

    if (created.length > 0 && skipped.length > 0) {
      return [
        `Created:\n  - ${created.join(joiner)}`,
        `Skipped (already exists):${joiner}${skipped.join(joiner)}`,
      ].join('\n\n')
    } else if (created.length > 0) {
      return `Created:\n  - ${created.join(joiner)}`
    }

    return `Skipped (already exists):\n  - ${skipped.join(joiner)}`
  }

  /**
   * Reads and processes documents from a file for creation
   */
  private async readAndPerformCreatesFromFile(
    operation: MutationOperationName,
    client: Awaited<ReturnType<typeof this.getProjectApiClient>>,
    filePath: string,
    defaultValue: unknown,
  ): Promise<void> {
    let content
    try {
      content = json5.parse(await fs.readFile(filePath, 'utf8'))
    } catch (err) {
      const error = err as Error
      createDocumentDebug(`Failed to read input file ${filePath}`, error)
      this.log(`Failed to read input: ${error.message}`)
      return
    }

    if (isEqual(content, defaultValue)) {
      this.log('Value not modified, doing nothing.')
      this.log('Modify document to trigger creation.')
      return
    }

    try {
      const writeResult = await this.writeDocuments(content, operation, client)
      this.log(this.getResultMessage(writeResult, operation))
    } catch (err) {
      const error = err as Error
      createDocumentDebug(`Failed to write documents`, error)
      let errorMessage = `Failed to write documents: ${error.message}`
      if (error.message.includes('already exists')) {
        errorMessage += '\nPerhaps you want to use `--replace` or `--missing`?'
      }
      this.error(errorMessage, {exit: 1})
    }
  }

  /**
   * Validates a document for Sanity requirements
   */
  private validateDocument(doc: unknown, index: number, arr: unknown[]): void {
    const isSingle = arr.length === 1

    if (!isPlainObject(doc)) {
      throw new Error(this.getErrorMessage('must be an object', index, isSingle))
    }

    if (!isSanityDocumentish(doc)) {
      throw new Error(
        this.getErrorMessage('must have a `_type` property of type string', index, isSingle),
      )
    }

    // Enhanced validations for Sanity document constraints
    const docObj = doc as Record<string, unknown>

    // Validate _type is non-empty
    const typeValue = docObj._type?.toString().trim()
    if (!typeValue) {
      throw new Error(this.getErrorMessage('_type cannot be empty', index, isSingle))
    }

    // Validate _type format (alphanumeric, underscore, hyphen, dot)
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(typeValue)) {
      throw new Error(
        this.getErrorMessage(
          '_type must start with a letter and contain only alphanumeric characters, underscores, hyphens, and dots',
          index,
          isSingle,
        ),
      )
    }

    // Validate _id format if present
    if (docObj._id && typeof docObj._id === 'string') {
      const idValue = docObj._id.trim()
      if (!idValue) {
        throw new Error(this.getErrorMessage('_id cannot be empty', index, isSingle))
      }

      // Sanity document IDs can contain alphanumeric chars, hyphens, underscores, and dots
      if (!/^[a-zA-Z0-9_.-]+$/.test(idValue)) {
        throw new Error(
          this.getErrorMessage(
            '_id can only contain alphanumeric characters, underscores, hyphens, and dots',
            index,
            isSingle,
          ),
        )
      }

      // Check length constraints (Sanity has reasonable limits)
      if (idValue.length > 200) {
        throw new Error(
          this.getErrorMessage('_id cannot be longer than 200 characters', index, isSingle),
        )
      }
    }

    // Warn about reserved fields (these are managed by Sanity)
    const reservedFields = ['_rev', '_updatedAt', '_createdAt']
    for (const field of reservedFields) {
      if (field in docObj) {
        // Note: We don't throw an error here as these might be present in fetched documents
        // that are being re-uploaded, but we could add a debug warning
        createDocumentDebug(
          `Warning: Document ${index} contains reserved field '${field}' which will be ignored by Sanity`,
        )
      }
    }
  }

  /**
   * Writes documents to Sanity using the specified operation
   */
  private async writeDocuments(
    documents: {_id?: string; _type: string} | {_id?: string; _type: string}[],
    operation: MutationOperationName,
    client: Awaited<ReturnType<typeof this.getProjectApiClient>>,
  ): Promise<MultipleMutationResult> {
    const docs = Array.isArray(documents) ? documents : [documents]
    if (docs.length === 0) {
      throw new Error('No documents provided')
    }

    const mutations = docs.map((doc, index): Mutation => {
      this.validateDocument(doc, index, docs)
      if (operation === 'create') {
        return {create: doc}
      }

      if (operation === 'createIfNotExists') {
        if (isIdentifiedSanityDocument(doc)) {
          return {createIfNotExists: doc}
        }

        throw new Error(`Missing required _id attribute for ${operation}`)
      }

      if (operation === 'createOrReplace') {
        if (isIdentifiedSanityDocument(doc)) {
          return {createOrReplace: doc}
        }

        throw new Error(`Missing required _id attribute for ${operation}`)
      }

      throw new Error(`Unsupported operation ${operation}`)
    })

    return client.transaction(mutations).commit()
  }
}

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {uuid} from '@sanity/uuid'
import {watch as chokidarWatch} from 'chokidar'
import {execa, execaSync} from 'execa'
import json5 from 'json5'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {CreateDocumentCommand} from '../create.js'

// Mock external dependencies
vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('chokidar', () => ({
  watch: vi.fn(),
}))
vi.mock('execa')
vi.mock('json5')

// Mock @sanity/uuid
vi.mock('@sanity/uuid', () => ({
  uuid: vi.fn(),
}))

// Mock the config functions
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockUuid = vi.mocked(uuid)
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockChokidarWatch = vi.mocked(chokidarWatch)
const mockExeca = vi.mocked(execa)
const mockExecaSync = vi.mocked(execaSync)
const mockJson5 = vi.mocked(json5)

const testProjectId = 'test-project'
const testDataset = 'production'

// Helper to set environment variable for tests
function withEditorEnv(testFn: () => Promise<void>) {
  return async () => {
    vi.stubEnv('EDITOR', 'vim')
    try {
      await testFn()
    } finally {
      vi.unstubAllEnvs()
    }
  }
}

// Helper functions moved to outer scope to fix linting
const setupMocks = () => {
  mockGetCliConfig.mockResolvedValue({
    api: {
      dataset: testDataset,
      projectId: testProjectId,
    },
  })
  const mockClient = {
    transaction: vi.fn().mockReturnValue({
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'create'}],
      }),
    }),
  }
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
  return mockClient
}

const setupEditorMocks = () => {
  mockGetCliConfig.mockResolvedValue({
    api: {
      dataset: testDataset,
      projectId: testProjectId,
    },
  })
  mockOs.tmpdir.mockReturnValue('/tmp')
  mockFs.mkdir.mockResolvedValue(undefined)
  mockFs.writeFile.mockResolvedValue(undefined)
  mockFs.unlink.mockResolvedValue(undefined)
  mockExecaSync.mockReturnValue(undefined as never)
}

const setupWatchMocks = () => {
  mockGetCliConfig.mockResolvedValue({
    api: {
      dataset: testDataset,
      projectId: testProjectId,
    },
  })
  mockOs.tmpdir.mockReturnValue('/tmp')
  mockFs.mkdir.mockResolvedValue(undefined)
  mockFs.writeFile.mockResolvedValue(undefined)
  mockFs.unlink.mockResolvedValue(undefined)
}

describe('#documents:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents create', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Create one or more documents

      USAGE
        $ sanity documents create [FILE] [-d <value>] [--id <value>] [--json5]
          [--missing] [--replace] [--watch]

      ARGUMENTS
        FILE  JSON file to create document(s) from

      FLAGS
        -d, --dataset=<value>  Dataset to create document(s) in (overrides config)
            --id=<value>       Specify a document ID to use. Will fetch remote
                               document ID and populate editor.
            --json5            Use JSON5 file type to allow a "simplified" version of
                               JSON
            --missing          On duplicate document IDs, don't modify the target
                               document(s)
            --replace          On duplicate document IDs, replace existing document
                               with specified document(s)
            --watch            Write the documents whenever the target file or buffer
                               changes

      DESCRIPTION
        Create one or more documents

      EXAMPLES
        Create the document specified in "myDocument.json"

          $ sanity documents create myDocument.json

        Open configured $EDITOR and create the specified document(s)

          $ sanity documents create

        Fetch document with the ID "myDocId" and open configured $EDITOR with the
        current document content (if any). Replace document with the edited version
        when the editor closes

          $ sanity documents create --id myDocId --replace

        Open configured $EDITOR and replace the document with the given content on
        each save. Use JSON5 file extension and parser for simplified syntax.

          $ sanity documents create --id myDocId --watch --replace --json5

      "
    `)
  })

  test('creates document from file successfully', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = {
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'create'}],
      }),
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockClient = {
      transaction: vi.fn().mockReturnValue(mockTransaction),
    }
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json'])

    expect(stdout).toContain('Created:')
    expect(stdout).toContain('test-doc')
    expect(mockFs.readFile).toHaveBeenCalledWith(
      path.resolve(process.cwd(), 'test-doc.json'),
      'utf8',
    )
    expect(mockClient.transaction).toHaveBeenCalledWith([{create: mockDoc}])
  })

  test('creates document with replace flag', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = {
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'update'}],
      }),
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockClient = {
      transaction: vi.fn().mockReturnValue(mockTransaction),
    }
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--replace'])

    expect(stdout).toContain('Upserted:')
    expect(stdout).toContain('test-doc')
    expect(mockClient.transaction).toHaveBeenCalledWith([{createOrReplace: mockDoc}])
  })

  test('creates document with missing flag', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = {
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'update'}],
      }),
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockClient = {
      transaction: vi.fn().mockReturnValue(mockTransaction),
    }
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--missing'])

    expect(stdout).toContain('Skipped (already exists):')
    expect(stdout).toContain('test-doc')
    expect(mockClient.transaction).toHaveBeenCalledWith([{createIfNotExists: mockDoc}])
  })

  test(
    'opens editor when no file specified',
    withEditorEnv(async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          dataset: testDataset,
          projectId: testProjectId,
        },
      })

      const mockClient = {
        getDocument: vi.fn().mockResolvedValue(null),
        transaction: vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'generated-id', operation: 'create'}],
          }),
        }),
      }
      mockGetProjectCliClient.mockResolvedValue(mockClient as never)

      mockOs.tmpdir.mockReturnValue('/tmp')
      mockFs.mkdir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      mockFs.readFile.mockResolvedValue('{"_id": "generated-id", "_type": "updated-type"}')
      mockFs.unlink.mockResolvedValue(undefined)
      mockJson5.stringify.mockReturnValue('{"_id": "generated-id", "_type": "specify-me"}')
      mockJson5.parse.mockReturnValue({_id: 'generated-id', _type: 'updated-type'})
      mockExecaSync.mockReturnValue(undefined as never)

      const {stdout} = await testCommand(CreateDocumentCommand, [])

      expect(stdout).toContain('Created:')
      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/sanity-cli', {
        mode: 0o700,
        recursive: true,
      })
      expect(mockExecaSync).toHaveBeenCalled()
    }),
  )

  test('uses custom dataset when --dataset flag is provided', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const mockClient = {
      transaction: vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'test-doc', operation: 'create'}],
        }),
      }),
    }
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, [
      'test-doc.json',
      '--dataset',
      'staging',
    ])

    expect(stdout).toContain('Created:')
    expect(mockGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
      }),
    )
  })

  test('throws error when both --replace and --missing flags are used', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(CreateDocumentCommand, [
      'test-doc.json',
      '--replace',
      '--missing',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Cannot use both --replace and --missing')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when --id and file path are both provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--id', 'myDocId'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Cannot use --id when specifying a file path')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is configured', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: undefined,
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles file reading errors gracefully', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockGetProjectCliClient.mockResolvedValue({} as never)
    mockFs.readFile.mockRejectedValue(new Error('File not found'))

    const {error} = await testCommand(CreateDocumentCommand, ['nonexistent.json'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create documents')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('validates document structure', async () => {
    const invalidDoc = {title: 'Test Post'} // Missing _type

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockGetProjectCliClient.mockResolvedValue({} as never)
    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidDoc))
    mockJson5.parse.mockReturnValue(invalidDoc)

    const {error} = await testCommand(CreateDocumentCommand, ['invalid-doc.json'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create documents')
    expect(error?.oclif?.exit).toBe(1)
  })

  test(
    'uses JSON5 when --json5 flag is provided',
    withEditorEnv(async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          dataset: testDataset,
          projectId: testProjectId,
        },
      })

      const mockClient = {
        getDocument: vi.fn().mockResolvedValue(null),
        transaction: vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'generated-id', operation: 'create'}],
          }),
        }),
      }
      mockGetProjectCliClient.mockResolvedValue(mockClient as never)

      mockOs.tmpdir.mockReturnValue('/tmp')
      mockFs.mkdir.mockResolvedValue(undefined)
      mockFs.writeFile.mockResolvedValue(undefined)
      mockFs.readFile.mockResolvedValue('{"_id": "generated-id", "_type": "updated-type"}')
      mockFs.unlink.mockResolvedValue(undefined)
      mockJson5.stringify.mockReturnValue('{"_id": "generated-id", "_type": "specify-me"}')
      mockJson5.parse.mockReturnValue({_id: 'generated-id', _type: 'updated-type'})
      mockExecaSync.mockReturnValue(undefined as never)

      await testCommand(CreateDocumentCommand, ['--json5'])

      expect(mockJson5.stringify).toHaveBeenCalled()
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json5'),
        expect.any(String),
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      )
    }),
  )

  describe('validation', () => {
    test.each([
      ['non-object document', 'not an object', 'Document must be an object'],
      [
        'document without _type',
        {title: 'Test'},
        'Document must have a `_type` property of type string',
      ],
      ['document with empty _type', {_type: '', title: 'Test'}, 'Document _type cannot be empty'],
      [
        'document with invalid _type format (starts with number)',
        {_type: '1invalid', title: 'Test'},
        'Document _type must start with a letter',
      ],
      [
        'document with invalid _type format (special chars)',
        {_type: 'invalid@type', title: 'Test'},
        'Document _type must start with a letter and contain only alphanumeric characters',
      ],
      [
        'document with empty _id',
        {_id: '   ', _type: 'test', title: 'Test'},
        'Document _id cannot be empty',
      ],
      [
        'document with invalid _id format',
        {_id: 'invalid@id', _type: 'test', title: 'Test'},
        'Document _id can only contain alphanumeric characters',
      ],
      [
        'document with _id too long',
        {_id: 'a'.repeat(201), _type: 'test', title: 'Test'},
        'Document _id cannot be longer than 200 characters',
      ],
    ])('validates %s', async (description, doc, expectedErrorSubstring) => {
      setupMocks()
      mockFs.readFile.mockResolvedValue(JSON.stringify(doc))
      mockJson5.parse.mockReturnValue(doc)

      const {error} = await testCommand(CreateDocumentCommand, ['invalid-doc.json'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain(expectedErrorSubstring)
      expect(error?.oclif?.exit).toBe(1)
    })

    test.each([
      [
        'multiple documents with invalid first document',
        [{title: 'Invalid'}, {_type: 'valid', title: 'Valid'}],
        'Document at index 0 must have a `_type` property of type string',
      ],
      [
        'multiple documents with invalid second document',
        [{_type: 'valid', title: 'Valid'}, {title: 'Invalid'}],
        'Document at index 1 must have a `_type` property of type string',
      ],
    ])('validates %s', async (description, docs, expectedErrorSubstring) => {
      setupMocks()
      mockFs.readFile.mockResolvedValue(JSON.stringify(docs))
      mockJson5.parse.mockReturnValue(docs)

      const {error} = await testCommand(CreateDocumentCommand, ['invalid-docs.json'])

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain(expectedErrorSubstring)
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('batch operations', () => {
    test.each([
      ['create', 'create', 'Created:'],
      ['createOrReplace', 'replace', 'Upserted:'],
      ['createIfNotExists', 'missing', 'Skipped (already exists):'],
    ])('handles multiple documents with %s operation', async (operation, flag, expectedMessage) => {
      const mockDocs = [
        {_id: 'doc1', _type: 'post', title: 'Post 1'},
        {_id: 'doc2', _type: 'post', title: 'Post 2'},
      ]

      const mockTransaction = {
        commit: vi.fn().mockResolvedValue({
          results: [
            {id: 'doc1', operation: operation === 'createIfNotExists' ? 'update' : 'create'},
            {id: 'doc2', operation: operation === 'createIfNotExists' ? 'update' : 'create'},
          ],
        }),
      }

      setupMocks()
      const mockClient = {
        transaction: vi.fn().mockReturnValue(mockTransaction),
      }
      mockGetProjectCliClient.mockResolvedValue(mockClient as never)
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockDocs))
      mockJson5.parse.mockReturnValue(mockDocs)

      const args = ['docs.json']
      if (flag !== 'create') args.push(`--${flag}`)

      const {stdout} = await testCommand(CreateDocumentCommand, args)

      expect(stdout).toContain(expectedMessage)
      expect(stdout).toContain('doc1')
      expect(stdout).toContain('doc2')

      const expectedMutations = mockDocs.map((doc) => ({[operation]: doc}))
      expect(mockClient.transaction).toHaveBeenCalledWith(expectedMutations)
    })

    test('handles mixed results for createIfNotExists', async () => {
      const mockDocs = [
        {_id: 'doc1', _type: 'post', title: 'Post 1'},
        {_id: 'doc2', _type: 'post', title: 'Post 2'},
        {_id: 'doc3', _type: 'post', title: 'Post 3'},
      ]

      const mockTransaction = {
        commit: vi.fn().mockResolvedValue({
          results: [
            {id: 'doc1', operation: 'create'}, // Created
            {id: 'doc2', operation: 'update'}, // Skipped (already exists)
            {id: 'doc3', operation: 'create'}, // Created
          ],
        }),
      }

      setupMocks()
      const mockClient = {
        transaction: vi.fn().mockReturnValue(mockTransaction),
      }
      mockGetProjectCliClient.mockResolvedValue(mockClient as never)
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockDocs))
      mockJson5.parse.mockReturnValue(mockDocs)

      const {stdout} = await testCommand(CreateDocumentCommand, ['docs.json', '--missing'])

      expect(stdout).toContain('Created:')
      expect(stdout).toContain('doc1')
      expect(stdout).toContain('doc3')
      expect(stdout).toContain('Skipped (already exists):')
      expect(stdout).toContain('doc2')
    })
  })

  describe('editor workflow', () => {
    test(
      'fetches existing document with --id flag',
      withEditorEnv(async () => {
        const existingDoc = {
          _id: 'existing-doc',
          _type: 'post',
          title: 'Existing Post',
        }

        const mockClient = {
          getDocument: vi.fn().mockResolvedValue(existingDoc),
          transaction: vi.fn().mockReturnValue({
            commit: vi.fn().mockResolvedValue({
              results: [{id: 'existing-doc', operation: 'update'}],
            }),
          }),
        }
        mockGetProjectCliClient.mockResolvedValue(mockClient as never)

        setupEditorMocks()
        mockFs.readFile.mockResolvedValue(JSON.stringify({...existingDoc, title: 'Updated Post'}))
        mockJson5.parse.mockReturnValue({...existingDoc, title: 'Updated Post'})
        mockJson5.stringify.mockReturnValue(JSON.stringify(existingDoc, null, 2))

        const {stdout} = await testCommand(CreateDocumentCommand, ['--id', 'existing-doc'])

        expect(mockClient.getDocument).toHaveBeenCalledWith('existing-doc')
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('existing-doc.json'),
          JSON.stringify(existingDoc, null, 2),
          expect.objectContaining({mode: 0o600}),
        )
        expect(stdout).toContain('Created:')
      }),
    )

    test(
      'handles no changes made in editor',
      withEditorEnv(async () => {
        const mockClient = {
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: vi.fn(),
        }
        mockGetProjectCliClient.mockResolvedValue(mockClient as never)

        setupEditorMocks()

        // Set up predictable UUID
        mockUuid.mockReturnValue('test-doc')

        const defaultDoc = {
          _id: 'test-doc',
          _type: 'specify-me',
        }

        // First mock the writeFile call for initial template
        const writeFileContent = JSON.stringify(defaultDoc, null, 2)
        mockJson5.stringify.mockReturnValue(writeFileContent)

        // Set up the file read to return the exact same content structure
        mockFs.readFile.mockResolvedValue(writeFileContent)
        // Return the exact same object structure that was written
        mockJson5.parse.mockReturnValue(defaultDoc)

        await testCommand(CreateDocumentCommand, [])

        // The key test - transaction should not have been called since no changes were made
        expect(mockClient.transaction).not.toHaveBeenCalled()
      }),
    )

    test(
      'handles write error with already exists hint',
      withEditorEnv(async () => {
        const mockDoc = {
          _id: 'test-doc',
          _type: 'post',
          title: 'Test Post',
        }

        const mockClient = {
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: vi.fn().mockReturnValue({
            commit: vi.fn().mockRejectedValue(new Error('Document already exists')),
          }),
        }
        mockGetProjectCliClient.mockResolvedValue(mockClient as never)

        setupEditorMocks()
        mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
        mockJson5.parse.mockReturnValue(mockDoc)
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )

        const {error} = await testCommand(CreateDocumentCommand, [])

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toContain('Failed to write documents: Document already exists')
        expect(error?.message).toContain('Perhaps you want to use `--replace` or `--missing`?')
        expect(error?.oclif?.exit).toBe(1)
      }),
    )
  })

  describe('watch mode', () => {
    test(
      'enables watch mode and logs appropriate messages',
      withEditorEnv(async () => {
        const mockWatcher = {
          on: vi.fn().mockReturnThis(),
        }
        mockChokidarWatch.mockReturnValue(mockWatcher as never)

        const mockClient = {
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: vi.fn().mockReturnValue({
            commit: vi.fn().mockResolvedValue({
              results: [{id: 'test-doc', operation: 'create'}],
            }),
          }),
        }
        mockGetProjectCliClient.mockResolvedValue(mockClient as never)

        setupWatchMocks()
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )
        mockExeca.mockResolvedValue({} as never)

        const {stdout} = await testCommand(CreateDocumentCommand, ['--watch'])

        expect(stdout).toContain('Watch mode:')
        expect(stdout).toContain('Will write documents on each save.')
        expect(stdout).toContain('Press Ctrl + C to cancel watch mode.')
        expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function))
        expect(mockExeca).toHaveBeenCalledWith('vim', expect.any(Array), {stdio: 'inherit'})
        expect(mockChokidarWatch).toHaveBeenCalledWith(expect.stringContaining('.json'))
      }),
    )

    test(
      'handles file change events in watch mode',
      withEditorEnv(async () => {
        const mockDoc = {
          _id: 'test-doc',
          _type: 'post',
          title: 'Updated Post',
        }

        let changeHandler: () => Promise<void>
        const mockWatcher = {
          on: vi.fn().mockImplementation((event: string, handler: () => Promise<void>) => {
            if (event === 'change') {
              changeHandler = handler
            }
            return mockWatcher
          }),
        }
        mockChokidarWatch.mockReturnValue(mockWatcher as never)

        const mockClient = {
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: vi.fn().mockReturnValue({
            commit: vi.fn().mockResolvedValue({
              results: [{id: 'test-doc', operation: 'create'}],
            }),
          }),
        }
        mockGetProjectCliClient.mockResolvedValue(mockClient as never)

        setupWatchMocks()
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )
        mockExeca.mockResolvedValue({} as never)

        // Mock file read to return different content for file change
        mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
        mockJson5.parse.mockReturnValue(mockDoc)

        await testCommand(CreateDocumentCommand, ['--watch'])

        // Simulate file change
        expect(changeHandler!).toBeDefined()
        await changeHandler!()

        expect(mockClient.transaction).toHaveBeenCalledWith([{create: mockDoc}])
      }),
    )
  })
})

import {randomUUID} from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {runCommand} from '@oclif/test'
import {getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {watch as chokidarWatch} from 'chokidar'
import {execa, execaSync} from 'execa'
import json5 from 'json5'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {CreateDocumentCommand} from '../create.js'

vi.mock('node:fs/promises')
vi.mock('node:os')
vi.mock('chokidar', () => ({
  watch: vi.fn(),
}))
vi.mock('execa')
vi.mock('json5')

vi.mock('node:crypto', async () => {
  return {
    randomUUID: vi.fn(),
  }
})

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockChokidarWatch = vi.mocked(chokidarWatch)
const mockExeca = vi.mocked(execa)
const mockExecaSync = vi.mocked(execaSync)
const mockJson5 = vi.mocked(json5)
const mockRandomUUID = vi.mocked(randomUUID)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

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

// Base configuration used across tests
const baseConfig = {
  api: {
    dataset: testDataset,
    projectId: testProjectId,
  },
}

const defaultMocks = {
  cliConfig: baseConfig,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

// Helper functions
const setupEditorMocks = () => {
  mockOs.tmpdir.mockReturnValue('/tmp')
  mockFs.mkdir.mockResolvedValue(undefined)
  mockFs.writeFile.mockResolvedValue(undefined)
  mockFs.unlink.mockResolvedValue(undefined)
  mockExecaSync.mockReturnValue(undefined as never)
}

const setupWatchMocks = () => {
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
        [FILE]  JSON file to create document(s) from

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

  test('creates document from JSON file and displays success message', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = vi.fn().mockReturnValue({
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'create'}],
      }),
    })

    mockGetProjectCliClient.mockResolvedValue({
      transaction: mockTransaction,
    } as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(stdout).toContain('Created:')
    expect(stdout).toContain('test-doc')
    expect(mockFs.readFile).toHaveBeenCalledWith(
      path.resolve(process.cwd(), 'test-doc.json'),
      'utf8',
    )
    expect(mockTransaction).toHaveBeenCalledWith([{create: mockDoc}])
  })

  test('creates document with replace flag', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = vi.fn().mockReturnValue({
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'update'}],
      }),
    })

    mockGetProjectCliClient.mockResolvedValue({
      transaction: mockTransaction,
    } as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--replace'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(stdout).toContain('Upserted:')
    expect(stdout).toContain('test-doc')
    expect(mockTransaction).toHaveBeenCalledWith([{createOrReplace: mockDoc}])
  })

  test('creates document with missing flag', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = vi.fn().mockReturnValue({
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'update'}],
      }),
    })

    mockGetProjectCliClient.mockResolvedValue({
      transaction: mockTransaction,
    } as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--missing'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(stdout).toContain('Skipped (already exists):')
    expect(stdout).toContain('test-doc')
    expect(mockTransaction).toHaveBeenCalledWith([{createIfNotExists: mockDoc}])
  })

  test(
    'opens editor when no file specified and creates document from editor content',
    withEditorEnv(async () => {
      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'generated-id', operation: 'create'}],
        }),
      })

      mockGetProjectCliClient.mockResolvedValue({
        getDocument: vi.fn().mockResolvedValue(null),
        transaction: mockTransaction,
      } as never)

      setupEditorMocks()
      mockFs.readFile.mockResolvedValue('{"_id": "generated-id", "_type": "updated-type"}')
      mockJson5.stringify.mockReturnValue('{"_id": "generated-id", "_type": "specify-me"}')
      mockJson5.parse.mockReturnValue({_id: 'generated-id', _type: 'updated-type'})

      const {stdout} = await testCommand(CreateDocumentCommand, [], {
        mocks: {
          ...defaultMocks,
        },
      })

      expect(stdout).toContain('Created:')
      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/sanity-cli', {
        mode: 0o700,
        recursive: true,
      })
      expect(mockExecaSync).toHaveBeenCalled()
    }),
  )

  test('uses custom dataset from --dataset flag instead of config', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    const mockTransaction = vi.fn().mockReturnValue({
      commit: vi.fn().mockResolvedValue({
        results: [{id: 'test-doc', operation: 'create'}],
      }),
    })

    mockGetProjectCliClient.mockResolvedValue({
      transaction: mockTransaction,
    } as never)

    mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
    mockJson5.parse.mockReturnValue(mockDoc)

    const {stdout} = await testCommand(
      CreateDocumentCommand,
      ['test-doc.json', '--dataset', 'staging'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(stdout).toContain('Created:')
    expect(mockGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
      }),
    )
  })

  test('throws error when both --replace and --missing flags are used', async () => {
    const {error} = await testCommand(
      CreateDocumentCommand,
      ['test-doc.json', '--replace', '--missing'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Cannot use both --replace and --missing')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when --id and file path are both provided', async () => {
    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json', '--id', 'myDocId'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Cannot use --id when specifying a file path')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is configured', async () => {
    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: undefined,
          },
        },
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    const {error} = await testCommand(CreateDocumentCommand, ['test-doc.json'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: undefined,
            projectId: testProjectId,
          },
        },
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays error message when file cannot be read', async () => {
    mockFs.readFile.mockRejectedValue(new Error('File not found'))

    const {error} = await testCommand(CreateDocumentCommand, ['nonexistent.json'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create documents')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('validates document has required _type property', async () => {
    const invalidDoc = {title: 'Test Post'} // Missing _type

    mockFs.readFile.mockResolvedValue(JSON.stringify(invalidDoc))
    mockJson5.parse.mockReturnValue(invalidDoc)

    const {error} = await testCommand(CreateDocumentCommand, ['invalid-doc.json'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create documents')
    expect(error?.oclif?.exit).toBe(1)
  })

  test(
    'uses JSON5 when --json5 flag is provided',
    withEditorEnv(async () => {
      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'generated-id', operation: 'create'}],
        }),
      })
      mockGetProjectCliClient.mockResolvedValue({
        getDocument: vi.fn().mockResolvedValue(null),
        transaction: mockTransaction,
      } as never)

      setupEditorMocks()
      mockFs.readFile.mockResolvedValue('{"_id": "generated-id", "_type": "updated-type"}')
      mockJson5.stringify.mockReturnValue('{"_id": "generated-id", "_type": "specify-me"}')
      mockJson5.parse.mockReturnValue({_id: 'generated-id', _type: 'updated-type'})

      await testCommand(CreateDocumentCommand, ['--json5'], {
        mocks: {
          ...defaultMocks,
        },
      })

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
      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'test-doc', operation: 'create'}],
        }),
      })
      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(doc))
      mockJson5.parse.mockReturnValue(doc)

      const {error} = await testCommand(CreateDocumentCommand, ['invalid-doc.json'], {
        mocks: {
          ...defaultMocks,
        },
      })

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
      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'test-doc', operation: 'create'}],
        }),
      })
      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(docs))
      mockJson5.parse.mockReturnValue(docs)

      const {error} = await testCommand(CreateDocumentCommand, ['invalid-docs.json'], {
        mocks: {
          ...defaultMocks,
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain(expectedErrorSubstring)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('allows documents with reserved fields but logs debug warning', async () => {
      const docWithReservedFields = {
        _createdAt: '2024-01-01T00:00:00Z',
        _id: 'test-doc',
        _rev: 'some-revision',
        _type: 'post',
        _updatedAt: '2024-01-02T00:00:00Z',
        title: 'Test Post',
      }

      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'test-doc', operation: 'create'}],
        }),
      })

      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(docWithReservedFields))
      mockJson5.parse.mockReturnValue(docWithReservedFields)

      // Should not throw error, but should proceed with document creation
      const {stdout} = await testCommand(CreateDocumentCommand, ['doc.json'], {
        mocks: {
          ...defaultMocks,
        },
      })

      expect(stdout).toContain('Created:')
      expect(stdout).toContain('test-doc')
      expect(mockTransaction).toHaveBeenCalledWith([{create: docWithReservedFields}])
    })

    test('validates empty document array throws error', async () => {
      const emptyArray: unknown[] = []

      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [{id: 'test-doc', operation: 'create'}],
        }),
      })

      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyArray))
      mockJson5.parse.mockReturnValue(emptyArray)

      const {error} = await testCommand(CreateDocumentCommand, ['empty-docs.json'], {
        mocks: {
          ...defaultMocks,
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('No documents provided')
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

      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [
            {id: 'doc1', operation: operation === 'createIfNotExists' ? 'update' : 'create'},
            {id: 'doc2', operation: operation === 'createIfNotExists' ? 'update' : 'create'},
          ],
        }),
      })

      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockDocs))
      mockJson5.parse.mockReturnValue(mockDocs)

      const args = ['docs.json']
      if (flag !== 'create') args.push(`--${flag}`)

      const {stdout} = await testCommand(CreateDocumentCommand, args, {
        mocks: {
          ...defaultMocks,
        },
      })

      expect(stdout).toContain(expectedMessage)
      expect(stdout).toContain('doc1')
      expect(stdout).toContain('doc2')

      const expectedMutations = mockDocs.map((doc) => ({[operation]: doc}))
      expect(mockTransaction).toHaveBeenCalledWith(expectedMutations)
    })

    test('handles mixed results for createIfNotExists', async () => {
      const mockDocs = [
        {_id: 'doc1', _type: 'post', title: 'Post 1'},
        {_id: 'doc2', _type: 'post', title: 'Post 2'},
        {_id: 'doc3', _type: 'post', title: 'Post 3'},
      ]

      const mockTransaction = vi.fn().mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          results: [
            {id: 'doc1', operation: 'create'}, // Created
            {id: 'doc2', operation: 'update'}, // Skipped (already exists)
            {id: 'doc3', operation: 'create'}, // Created
          ],
        }),
      })

      mockGetProjectCliClient.mockResolvedValue({
        transaction: mockTransaction,
      } as never)

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockDocs))
      mockJson5.parse.mockReturnValue(mockDocs)

      const {stdout} = await testCommand(CreateDocumentCommand, ['docs.json', '--missing'], {
        mocks: {
          ...defaultMocks,
        },
      })

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

        const mockTransaction = vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'existing-doc', operation: 'update'}],
          }),
        } as never)

        const mockGetDocument = vi.fn().mockResolvedValue(existingDoc)

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: mockGetDocument,
          transaction: mockTransaction,
        } as never)

        setupEditorMocks()
        mockFs.readFile.mockResolvedValue(JSON.stringify({...existingDoc, title: 'Updated Post'}))
        mockJson5.parse.mockReturnValue({...existingDoc, title: 'Updated Post'})
        mockJson5.stringify.mockReturnValue(JSON.stringify(existingDoc, null, 2))

        const {stdout} = await testCommand(CreateDocumentCommand, ['--id', 'existing-doc'], {
          mocks: {
            ...defaultMocks,
          },
        })

        expect(mockGetDocument).toHaveBeenCalledWith('existing-doc')
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
        const mockTransaction = vi.fn()

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: mockTransaction,
        } as never)

        setupEditorMocks()

        // Set up a predictable UUID so the test can verify no changes were made
        const testUuid = '123e4567-e89b-12d3-a456-426614174000'
        mockRandomUUID.mockReturnValue(testUuid)

        const defaultDoc = {
          _id: testUuid,
          _type: 'specify-me',
        }

        // First mock the writeFile call for initial template
        const writeFileContent = JSON.stringify(defaultDoc, null, 2)
        mockJson5.stringify.mockReturnValue(writeFileContent)

        // Set up the file read to return the exact same content structure
        mockFs.readFile.mockResolvedValue(writeFileContent)
        // Return the exact same object structure that was written
        mockJson5.parse.mockReturnValue(defaultDoc)

        await testCommand(CreateDocumentCommand, [], {
          mocks: {
            ...defaultMocks,
          },
        })

        // The key test - transaction should not have been called since no changes were made
        expect(mockTransaction).not.toHaveBeenCalled()
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

        const mockTransaction = vi.fn().mockReturnValue({
          commit: vi.fn().mockRejectedValue(new Error('Document already exists')),
        })

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: mockTransaction,
        } as never)

        setupEditorMocks()
        mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
        mockJson5.parse.mockReturnValue(mockDoc)
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )

        const {error} = await testCommand(CreateDocumentCommand, [], {
          mocks: {
            ...defaultMocks,
          },
        })

        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toContain('Failed to write documents: Document already exists')
        expect(error?.message).toContain('Perhaps you want to use `--replace` or `--missing`?')
        expect(error?.oclif?.exit).toBe(1)
      }),
    )

    test(
      'handles file cleanup errors silently',
      withEditorEnv(async () => {
        const mockDoc = {
          _id: 'test-doc',
          _type: 'post',
          title: 'Test Post',
        }

        const mockTransaction = vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'test-doc', operation: 'create'}],
          }),
        })

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: mockTransaction,
        } as never)

        setupEditorMocks()
        // Mock unlink to throw an error (should be caught silently)
        mockFs.unlink.mockRejectedValue(new Error('Permission denied'))
        mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
        mockJson5.parse.mockReturnValue(mockDoc)
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )

        const {stdout} = await testCommand(CreateDocumentCommand, [], {
          mocks: {
            ...defaultMocks,
          },
        })

        // Should still succeed despite file cleanup error
        expect(stdout).toContain('Created:')
        expect(stdout).toContain('test-doc')
        expect(mockFs.unlink).toHaveBeenCalled()
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

        const mockTransaction = vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'test-doc', operation: 'create'}],
          }),
        })

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: mockTransaction,
        } as never)

        setupWatchMocks()
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )
        mockExeca.mockResolvedValue({} as never)

        const {stdout} = await testCommand(CreateDocumentCommand, ['--watch'], {
          mocks: {
            ...defaultMocks,
          },
        })

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

        const mockTransaction = vi.fn().mockReturnValue({
          commit: vi.fn().mockResolvedValue({
            results: [{id: 'test-doc', operation: 'create'}],
          }),
        })

        mockGetProjectCliClient.mockResolvedValue({
          getDocument: vi.fn().mockResolvedValue(null),
          transaction: mockTransaction,
        } as never)

        setupWatchMocks()
        mockJson5.stringify.mockReturnValue(
          JSON.stringify({_id: 'test-doc', _type: 'specify-me'}, null, 2),
        )
        mockExeca.mockResolvedValue({} as never)

        // Mock file read to return different content for file change
        mockFs.readFile.mockResolvedValue(JSON.stringify(mockDoc))
        mockJson5.parse.mockReturnValue(mockDoc)

        await testCommand(CreateDocumentCommand, ['--watch'], {
          mocks: {
            ...defaultMocks,
          },
        })

        // Simulate file change
        expect(changeHandler!).toBeDefined()
        await changeHandler!()

        expect(mockTransaction).toHaveBeenCalledWith([{create: mockDoc}])
      }),
    )
  })
})

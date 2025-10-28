import {getProjectCliClient} from '@sanity/cli-core'
import {EventSource} from 'eventsource'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDataset,
  DATASET_API_VERSION,
  deleteDataset,
  editDatasetAcl,
  followCopyJobProgress,
  listDatasetAliases,
  listDatasets,
} from '../datasets.js'

vi.mock('eventsource', () => {
  return {
    EventSource: vi.fn(),
  }
})

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockClient = {
  config: vi.fn(),
  datasets: {
    create: vi.fn(),
    delete: vi.fn(),
    edit: vi.fn(),
    list: vi.fn(),
  },
  request: vi.fn(),
}

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

beforeEach(() => {
  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#listDatasets', () => {
  test('calls client.datasets.list with correct parameters', async () => {
    const mockDatasets = [{aclMode: 'private', name: 'production'}]
    mockClient.datasets.list.mockResolvedValue(mockDatasets)

    const result = await listDatasets('test-project')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.list).toHaveBeenCalledWith()
    expect(result).toBe(mockDatasets)
  })
})

describe('#deleteDataset', () => {
  test('calls client.datasets.delete with correct parameters', async () => {
    mockClient.datasets.delete.mockResolvedValue(undefined)

    await deleteDataset({datasetName: 'test-dataset', projectId: 'test-project'})

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.delete).toHaveBeenCalledWith('test-dataset')
  })
})

describe('#editDatasetAcl', () => {
  test('calls client.datasets.edit with correct parameters for private mode', async () => {
    mockClient.datasets.edit.mockResolvedValue({})

    await editDatasetAcl({
      aclMode: 'private',
      datasetName: 'test-dataset',
      projectId: 'test-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.edit).toHaveBeenCalledWith('test-dataset', {aclMode: 'private'})
  })

  test('calls client.datasets.edit with correct parameters for public mode', async () => {
    mockClient.datasets.edit.mockResolvedValue({})

    await editDatasetAcl({
      aclMode: 'public',
      datasetName: 'my-dataset',
      projectId: 'my-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'my-project',
      requireUser: true,
    })
    expect(mockClient.datasets.edit).toHaveBeenCalledWith('my-dataset', {aclMode: 'public'})
  })

  test('propagates errors from client', async () => {
    const error = new Error('API error')
    mockClient.datasets.edit.mockRejectedValue(error)

    await expect(
      editDatasetAcl({
        aclMode: 'private',
        datasetName: 'test-dataset',
        projectId: 'test-project',
      }),
    ).rejects.toThrow('API error')
  })
})

describe('#listDatasetAliases', () => {
  test('calls client.request with correct parameters', async () => {
    const mockAliases = [{datasetName: 'test-dataset', name: 'test-alias'}]
    mockClient.request.mockResolvedValue(mockAliases)

    const result = await listDatasetAliases('test-project')

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.request).toHaveBeenCalledWith({uri: '/aliases'})
    expect(result).toBe(mockAliases)
  })
})

describe('#createDataset', () => {
  test('calls client.datasets.create with correct parameters', async () => {
    mockClient.datasets.create.mockResolvedValue(undefined)

    await createDataset({
      aclMode: 'private',
      datasetName: 'test-dataset',
      projectId: 'test-project',
    })

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
    expect(mockClient.datasets.create).toHaveBeenCalledWith('test-dataset', {aclMode: 'private'})
  })

  test('calls client.datasets.create without aclMode if not provided', async () => {
    mockClient.datasets.create.mockResolvedValue(undefined)

    await createDataset({datasetName: 'test-dataset', projectId: 'test-project'})

    expect(mockClient.datasets.create).toHaveBeenCalledWith('test-dataset')
    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: DATASET_API_VERSION,
      projectId: 'test-project',
      requireUser: true,
    })
  })
})

describe('#followCopyJobProgress', () => {
  let mockEventSource: {
    addEventListener: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockEventSource = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.mocked(EventSource).mockImplementation(() => mockEventSource as never)
    mockClient.config = vi.fn().mockReturnValue({url: 'https://api.sanity.io'})
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)
  })

  test('subscribes to progress events and completes successfully', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})
      const events: unknown[] = []

      observable.subscribe({
        complete: () => {
          // When state is 'completed', onComplete is called which doesn't push the event
          expect(events).toEqual([
            {progress: 25, state: 'processing', type: 'job'},
            {progress: 50, state: 'processing', type: 'job'},
          ])
          expect(mockEventSource.close).toHaveBeenCalled()
          expect(mockEventSource.removeEventListener).toHaveBeenCalledTimes(4)
          resolve()
        },
        error: (err: Error) => {
          context.task.result?.errors?.push(err)
          resolve()
        },
        next: (event) => {
          events.push(event)
        },
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Simulate progress events
        const jobHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'job',
        )?.[1]

        if (jobHandler) {
          jobHandler({data: JSON.stringify({progress: 25, state: 'processing', type: 'job'})})
          jobHandler({data: JSON.stringify({progress: 50, state: 'processing', type: 'job'})})
          jobHandler({data: JSON.stringify({progress: 100, state: 'completed', type: 'job'})})
        }
      })
    })
  })

  test('handles JSON parse errors gracefully', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})

      observable.subscribe({
        complete: () => {
          context.task.result?.errors?.push(new Error('Should not complete'))
          resolve()
        },
        error: (err: Error) => {
          expect(err.message).toContain('Invalid JSON received from server')
          resolve()
        },
        next: () => {},
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Simulate invalid JSON
        const jobHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'job',
        )?.[1]

        if (jobHandler) {
          jobHandler({data: 'invalid json {'})
        }
      })
    })
  })

  test('emits reconnect event on error', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})
      const events: unknown[] = []
      let errorReceived = false

      const subscription = observable.subscribe({
        complete: () => {
          if (!errorReceived) {
            context.task.result?.errors?.push(new Error('Should not complete before error'))
          }
          resolve()
        },
        error: (_err: Error) => {
          errorReceived = true
          // This is expected when we stop the subscription after seeing reconnect
        },
        next: (event) => {
          events.push(event)
          // After seeing reconnect event, verify it was emitted correctly
          if (
            events.some(
              (e: unknown) =>
                typeof e === 'object' && e !== null && 'type' in e && e.type === 'reconnect',
            )
          ) {
            expect(events).toContainEqual({type: 'reconnect'})
            expect(mockEventSource.close).toHaveBeenCalled()
            subscription.unsubscribe()
            resolve()
          }
        },
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Simulate progress, then error
        const jobHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'job',
        )?.[1]
        const errorHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'error',
        )?.[1]

        if (jobHandler && errorHandler) {
          jobHandler({data: JSON.stringify({progress: 25, state: 'processing', type: 'job'})})
          errorHandler({})
        }
      })
    })
  })

  test('handles channel_error event', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})

      observable.subscribe({
        complete: () => {
          context.task.result?.errors?.push(new Error('Should not complete'))
          resolve()
        },
        error: (err: Error) => {
          expect(err.message).toContain('Copy job failed: Channel closed')
          expect(mockEventSource.close).toHaveBeenCalled()
          resolve()
        },
        next: () => {},
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Simulate channel error
        const channelErrorHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'channel_error',
        )?.[1]

        if (channelErrorHandler) {
          channelErrorHandler({data: 'Channel closed'})
        }
      })
    })
  })

  test('handles failed state in job message', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})

      observable.subscribe({
        complete: () => {
          context.task.result?.errors?.push(new Error('Should not complete'))
          resolve()
        },
        error: (err: Error) => {
          expect(err.message).toContain('Copy job failed: Disk space exceeded')
          resolve()
        },
        next: () => {},
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Simulate failed job
        const jobHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'job',
        )?.[1]

        if (jobHandler) {
          jobHandler({data: JSON.stringify({message: 'Disk space exceeded', state: 'failed'})})
        }
      })
    })
  })

  test('cleanup prevents reconnection when stopped', (context) => {
    return new Promise<void>((resolve) => {
      const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})

      const subscription = observable.subscribe({
        complete: () => {
          context.task.result?.errors?.push(new Error('Should not complete'))
          resolve()
        },
        error: (err: Error) => {
          context.task.result?.errors?.push(err)
          resolve()
        },
        next: () => {},
      })

      // Wait for async getJobListenUrl to complete
      setImmediate(() => {
        // Get error handler
        const errorHandler = mockEventSource.addEventListener.mock.calls.find(
          ([event]) => event === 'error',
        )?.[1]

        // Unsubscribe first to set stopped = true
        subscription.unsubscribe()

        // Now trigger error - should not create new EventSource
        const eventSourceCallCount = vi.mocked(EventSource).mock.calls.length
        if (errorHandler) {
          errorHandler({})
        }

        // Verify no new EventSource was created
        expect(vi.mocked(EventSource)).toHaveBeenCalledTimes(eventSourceCallCount)
        expect(mockEventSource.close).toHaveBeenCalled()
        resolve()
      })
    })
  })

  test('cleanup is idempotent (no errors on multiple calls)', () => {
    const observable = followCopyJobProgress({jobId: 'test-job', projectId: 'test-project'})

    const subscription = observable.subscribe({
      complete: () => {},
      error: () => {},
      next: () => {},
    })

    // Call unsubscribe multiple times
    expect(() => {
      subscription.unsubscribe()
      subscription.unsubscribe()
      subscription.unsubscribe()
    }).not.toThrow()
  })
})

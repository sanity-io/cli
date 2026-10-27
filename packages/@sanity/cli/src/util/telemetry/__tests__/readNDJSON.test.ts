import {afterEach, expect, test, vi} from 'vitest'

import {readNDJSON} from '../readNDJSON.js'

const {debug, readFile} = vi.hoisted(() => ({debug: vi.fn(), readFile: vi.fn()}))
vi.mock('node:fs/promises', () => ({readFile}))
vi.mock('../telemetryStoreDebug.js', () => ({telemetryStoreDebug: debug}))
afterEach(() => vi.clearAllMocks())

test('skips malformed lines without repeating their content in debug output', async () => {
  readFile.mockResolvedValue('private input\n{"safe":true}\n')
  expect(await readNDJSON('/tmp/telemetry.ndjson')).toEqual([{safe: true}])
  expect(readFile).toHaveBeenCalledWith('/tmp/telemetry.ndjson', 'utf8')
  expect(debug).toHaveBeenCalledOnce()
  expect(JSON.stringify(debug.mock.calls)).not.toContain('private input')
})

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  __resetStartTimeCacheForTesting,
  getProcessStartTime,
  isOurProcess,
} from '../processLiveness.js'

const mockExecSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({execSync: mockExecSync}))

/** Force `process.platform`; returns a restore fn. Both branches are exercised
 * regardless of the host OS (so the "unix" cases still run on Windows CI). */
function setPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', {configurable: true, value: platform})
  return () => Object.defineProperty(process, 'platform', {configurable: true, value: original})
}

/** Swap `process.platform` for the duration of a callback. */
function withPlatform(platform: NodeJS.Platform, fn: () => void) {
  const restore = setPlatform(platform)
  try {
    fn()
  } finally {
    restore()
  }
}

describe('processLiveness', () => {
  beforeEach(() => {
    __resetStartTimeCacheForTesting()
    // Default: our own process is alive.
    vi.spyOn(process, 'kill').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    __resetStartTimeCacheForTesting()
  })

  describe('getProcessStartTime (unix)', () => {
    let restorePlatform: () => void
    beforeEach(() => {
      restorePlatform = setPlatform('linux')
    })
    afterEach(() => restorePlatform())

    test('shells out to `ps -o lstart=` and parses the reported date', () => {
      const start = new Date('2026-04-17T11:38:10.000Z')
      mockExecSync.mockReturnValue(start.toString())

      const result = getProcessStartTime(1234)

      expect(result).toBeInstanceOf(Date)
      expect(result!.getTime()).toBe(new Date(start.toString()).getTime())
      expect(mockExecSync).toHaveBeenCalledWith(
        'ps -o lstart= -p 1234',
        expect.objectContaining({encoding: 'utf8'}),
      )
    })

    test('returns undefined when ps prints nothing', () => {
      mockExecSync.mockReturnValue('   ')
      expect(getProcessStartTime(1234)).toBeUndefined()
    })

    test('returns undefined when the reported date is unparseable', () => {
      mockExecSync.mockReturnValue('not a date')
      expect(getProcessStartTime(1234)).toBeUndefined()
    })

    test('returns undefined when ps is unavailable', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('ps not available')
      })
      expect(getProcessStartTime(1234)).toBeUndefined()
    })
  })

  describe('getProcessStartTime (win32)', () => {
    test('queries Win32_Process via a minimal, non-interactive PowerShell', () => {
      mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

      withPlatform('win32', () => {
        const result = getProcessStartTime(4321)
        expect(result).toBeInstanceOf(Date)
        expect(result!.getTime()).toBe(new Date('2026-04-17T11:38:10.000Z').getTime())
      })

      const cmd = mockExecSync.mock.calls[0][0] as string
      expect(cmd).toMatch(/^powershell\.exe /)
      expect(cmd).toContain('-NoProfile')
      expect(cmd).toContain('-NonInteractive')
      expect(cmd).toContain('Get-CimInstance Win32_Process')
      expect(cmd).toContain('ProcessId=4321')
      expect(cmd).toContain("CreationDate.ToString('o')")
    })

    test("memoises our own PID's start time across calls, but not other PIDs", () => {
      mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

      withPlatform('win32', () => {
        getProcessStartTime(process.pid)
        getProcessStartTime(process.pid)
        expect(mockExecSync).toHaveBeenCalledTimes(1)

        getProcessStartTime(9999)
        getProcessStartTime(9999)
        expect(mockExecSync).toHaveBeenCalledTimes(3)
      })
    })

    test('returns undefined when PowerShell fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("'powershell.exe' is not recognized")
      })

      withPlatform('win32', () => {
        expect(getProcessStartTime(4321)).toBeUndefined()
      })
    })

    test.each([
      ['prints nothing', '  '],
      ['prints an unparseable date', 'garbage'],
    ])('returns undefined when PowerShell %s', (_label, output) => {
      mockExecSync.mockReturnValue(output)

      withPlatform('win32', () => {
        expect(getProcessStartTime(4321)).toBeUndefined()
      })
    })
  })

  describe('isOurProcess', () => {
    test('returns false when the process is not alive', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH')
      })

      expect(isOurProcess(1234, new Date().toISOString())).toBe(false)
    })

    test('treats an EPERM signal error as alive', () => {
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw Object.assign(new Error('operation not permitted'), {code: 'EPERM'})
      })
      // ps unavailable → start time can't be verified, so alive is enough.
      mockExecSync.mockImplementation(() => {
        throw new Error('ps not available')
      })

      expect(isOurProcess(1234, new Date().toISOString())).toBe(true)
    })

    test('keeps a process whose stored start time matches the OS-reported one', () => {
      const start = new Date('2026-04-17T11:38:10.000Z')
      mockExecSync.mockReturnValue(start.toString())

      expect(isOurProcess(1234, new Date(start.toString()).toISOString())).toBe(true)
    })

    test('rejects a reused PID whose stored start time is far from the OS-reported one', () => {
      mockExecSync.mockReturnValue(new Date().toString())

      expect(isOurProcess(1234, '2020-01-01T00:00:00.000Z')).toBe(false)
    })

    test('falls back to the alive-check when the OS start time is unavailable', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('ps not available')
      })

      expect(isOurProcess(1234, '2020-01-01T00:00:00.000Z')).toBe(true)
    })

    test('falls back to the alive-check when the stored start time is unparseable', () => {
      mockExecSync.mockReturnValue(new Date().toString())

      expect(isOurProcess(1234, 'not-a-date')).toBe(true)
    })
  })
})

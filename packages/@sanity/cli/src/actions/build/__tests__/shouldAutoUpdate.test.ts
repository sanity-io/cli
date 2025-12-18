import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {shouldAutoUpdate} from '../shouldAutoUpdate'

describe('shouldAutoUpdate', () => {
  let mockOutput: Output

  beforeEach(() => {
    mockOutput = {
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as Output
  })

  describe('when no config is provided', () => {
    it('should return false', () => {
      const result = shouldAutoUpdate({
        cliConfig: {},
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })

  describe('when using deployment.autoUpdates config', () => {
    it('should return true when deployment.autoUpdates is true', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          deployment: {
            autoUpdates: true,
          },
        },
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(true)
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    it('should return false when deployment.autoUpdates is false', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          deployment: {
            autoUpdates: false,
          },
        },
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    it('should handle deployment object without autoUpdates property', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          deployment: {},
        },
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })

  describe('when using deprecated autoUpdates config', () => {
    it('should return true when autoUpdates is true and show deprecation warning with migration instructions', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          autoUpdates: true,
        },
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(true)
      expect(mockOutput.warn).toHaveBeenCalledWith(
        'The autoUpdates config has moved to deployment.autoUpdates.',
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('Please update sanity.cli.ts or sanity.cli.js'),
      )
      expect(mockOutput.warn).toHaveBeenCalledTimes(2)
      expect(mockOutput.error).not.toHaveBeenCalled()
    })

    it('should return false when autoUpdates is false and show deprecation warning with migration instructions', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          autoUpdates: false,
        },
        flags: {},
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).toHaveBeenCalledWith(
        'The autoUpdates config has moved to deployment.autoUpdates.',
      )
      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.stringContaining('Please update sanity.cli.ts or sanity.cli.js'),
      )
      expect(mockOutput.warn).toHaveBeenCalledTimes(2)
      expect(mockOutput.error).not.toHaveBeenCalled()
    })
  })

  describe('when both old and new configs are present', () => {
    it('should throw error', () => {
      shouldAutoUpdate({
        cliConfig: {
          autoUpdates: true,
          deployment: {
            autoUpdates: true,
          },
        },
        flags: {},
        output: mockOutput,
      })

      expect(mockOutput.error).toHaveBeenCalledWith(
        'Found both `autoUpdates` (deprecated) and `deployment.autoUpdates` in sanity.cli.js/.ts. Please remove the deprecated top level `autoUpdates` config.',
        {exit: 1},
      )
    })
  })

  describe('when using deprecated flags', () => {
    it('should warn when --auto-updates flag is used', () => {
      const result = shouldAutoUpdate({
        cliConfig: {},
        flags: {
          'auto-updates': true,
        },
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).toHaveBeenCalledWith(
        'The --auto-updates flag is deprecated for deploy and build commands. Set the autoUpdates option in the deployment section of sanity.cli.ts or sanity.cli.js instead.',
      )
    })

    it('should warn when --no-auto-updates flag is used', () => {
      const result = shouldAutoUpdate({
        cliConfig: {},
        flags: {
          'auto-updates': false,
        },
        output: mockOutput,
      })

      expect(result).toBe(false)
      expect(mockOutput.warn).toHaveBeenCalledWith(
        'The --no-auto-updates flag is deprecated for deploy and build commands. Set the autoUpdates option in the deployment section of sanity.cli.ts or sanity.cli.js instead.',
      )
    })

    it('should warn about flag but use config value when both are present', () => {
      const result = shouldAutoUpdate({
        cliConfig: {
          deployment: {
            autoUpdates: true,
          },
        },
        flags: {
          'auto-updates': false,
        },
        output: mockOutput,
      })

      expect(result).toBe(true)
      expect(mockOutput.warn).toHaveBeenCalledWith(
        'The --no-auto-updates flag is deprecated for deploy and build commands. Set the autoUpdates option in the deployment section of sanity.cli.ts or sanity.cli.js instead.',
      )
    })
  })
})

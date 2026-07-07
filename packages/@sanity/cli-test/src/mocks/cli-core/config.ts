import {type Mock, vi} from 'vitest'
// TODO: consider a 'createMockConfig' helper function that returns a fake CliConfig object?
// do we do that in tests in this repo?
/** @internal */
export const getCliConfig: Mock = vi.fn()
/** @internal */
export const getCliConfigUncached: Mock = vi.fn()
/** @internal */
export const getCliConfigSync: Mock = vi.fn()
/** @internal */
export const isWorkbenchApp: Mock = vi.fn()
/** @internal */
export const parseWorkbenchCliConfig: Mock = vi.fn()
/** @internal */
export const findProjectRoot: Mock = vi.fn()
/** @internal */
export const findProjectRootSync: Mock = vi.fn()
/** @internal */
export const getStudioConfig: Mock = vi.fn()
/** @internal */
export const getStudioWorkspaces: Mock = vi.fn()
/** @internal */
export const isStudioConfig: Mock = vi.fn()
/** @internal */
export const findStudioConfigPath: Mock = vi.fn()
/** @internal */
export const tryFindStudioConfigPath: Mock = vi.fn()
/** @internal */
export const getSanityConfigDir: Mock = vi.fn()
/** @internal */
export const getSanityDataDir: Mock = vi.fn()
/** @internal */
export const getSanityEnvVar: Mock = vi.fn()
/** @internal */
export const getSanityUrl: Mock = vi.fn()
/** @internal */
export const getWorkspace: Mock = vi.fn()

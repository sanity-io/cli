import {type Mock, vi} from 'vitest'

/** @internal */
export const getLocalPackageDir: Mock = vi.fn()
/** @internal */
export const getLocalPackageVersion: Mock = vi.fn()
/** @internal */
export const getBinCommand: Mock = vi.fn()
/** @internal */
export const getRunningPackageManager: Mock = vi.fn()
/** @internal */
export const getYarnMajorVersion: Mock = vi.fn()
/** @internal */
export const readPackageJson: Mock = vi.fn()
/** @internal */
export const resolveLocalPackage: Mock = vi.fn()
/** @internal */
export const resolveLocalPackageFrom: Mock = vi.fn()
/** @internal */
export const resolveLocalPackagePath: Mock = vi.fn()

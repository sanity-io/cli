import {type Mock, vi} from 'vitest'
/** @internal */
export const clearCliTelemetry: Mock = vi.fn()
/** @internal */
export const getCliTelemetry: Mock = vi.fn()
/** @internal */
export const reportCliTraceError: Mock = vi.fn()
/** @internal */
export const setCliTelemetry: Mock = vi.fn()
/** @internal */
export const getTelemetryBaseInfo: Mock = vi.fn()

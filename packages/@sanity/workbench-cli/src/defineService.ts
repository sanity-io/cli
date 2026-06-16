import {SERVICE_CONTRACT_VERSION, type ServiceType} from './contract.js'

/**
 * The service's own declaration, surfaced to the callback.
 * @public
 */
export interface ServiceInfo {
  readonly name: string
  readonly type: string
}

/**
 * Context every service callback receives when its worker starts. Mirrors how a
 * view component receives its `view` — the service receives its own `service`.
 * @public
 */
export interface ServiceContext {
  readonly service: ServiceInfo
}

/**
 * A service callback. Runs once inside the worker on start; returns an optional
 * disposer the host calls before terminating the worker.
 * @public
 */
export type ServiceCallback = (context: ServiceContext) => (() => void) | void

/** The callback shape each service type defines, keyed by type. */
interface ServiceCallbacksByType {
  worker: ServiceCallback
}

/**
 * The result of `unstable_defineService`: the author's callback, the service
 * type, and the internal contract version the worker artifact targets.
 * @public
 */
export interface DefinedService<TType extends ServiceType = ServiceType> {
  readonly run: ServiceCallbacksByType[TType]
  readonly type: TType
  /** @internal */
  readonly version: typeof SERVICE_CONTRACT_VERSION
}

/**
 * Define a Sanity Workbench background service. The first argument narrows the
 * callback shape — `"worker"` runs the callback inside a Web Worker, where it
 * can emit dock-badge updates and return a disposer.
 *
 * Identity at runtime: returns the callback tagged with its type and the contract
 * version, for the CLI build to generate a worker artifact from. Used as the
 * default export of a service's `src` file.
 * @public
 */
export function unstable_defineService<TType extends ServiceType>(
  type: TType,
  run: ServiceCallbacksByType[TType],
): DefinedService<TType> {
  return {run, type, version: SERVICE_CONTRACT_VERSION}
}

import {type WebWorkerProps} from '@sanity/sdk/dashboard'

import {WEB_WORKER_CONTRACT_VERSION, type WebWorkerType} from './contract.js'

export type {WebWorkerProps} from '@sanity/sdk/dashboard'

/**
 * @deprecated Use `WebWorkerProps['worker']`.
 * @public
 */
export type WebWorkerInfo = WebWorkerProps['worker']

/**
 * @deprecated Use `WebWorkerProps['bus']`.
 * @public
 */
export type WebWorkerBus = WebWorkerProps['bus']

/**
 * Context every service callback receives when its worker starts. Mirrors how a
 * view component receives its `view` — the service receives its own `service`.
 * @deprecated Use {@link WebWorkerProps}.
 * @public
 */
export interface ServiceContext {
  readonly bus: WebWorkerProps['bus']
  readonly service: WebWorkerProps['worker']
}

/**
 * A service callback. Runs once inside the worker on start; returns an optional
 * disposer the host calls before terminating the worker.
 * @deprecated Default-export a plain function that receives {@link WebWorkerProps} instead.
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
 * @deprecated Default-export a plain function that receives {@link WebWorkerProps} instead.
 * @public
 */
export interface DefinedService<TType extends WebWorkerType = WebWorkerType> {
  readonly run: ServiceCallbacksByType[TType]
  readonly type: TType
  /** @internal */
  readonly version: typeof WEB_WORKER_CONTRACT_VERSION
}

/**
 * Define a Sanity Dashboard background service. The first argument narrows the
 * callback shape — `"worker"` runs the callback inside a Web Worker with the
 * bus described on {@link WebWorkerProps}.
 *
 * Identity at runtime: returns the callback tagged with its type and the contract
 * version, for the CLI build to generate a worker artifact from. Used as the
 * default export of a service's `src` file.
 * @deprecated Default-export a plain function that receives {@link WebWorkerProps} from the web worker's `src` file instead.
 * @public
 */
export function unstable_defineService<TType extends WebWorkerType>(
  type: TType,
  run: ServiceCallbacksByType[TType],
): DefinedService<TType> {
  return {run, type, version: WEB_WORKER_CONTRACT_VERSION}
}

/**
 * @deprecated Use `WebWorkerProps['bus']`.
 * @public
 */
export type ServiceBus = WebWorkerProps['bus']

/**
 * @deprecated Use `WebWorkerProps['worker']`.
 * @public
 */
export type ServiceInfo = WebWorkerProps['worker']

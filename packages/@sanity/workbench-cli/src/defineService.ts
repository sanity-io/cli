import {
  type MessageBus,
  type MessageBusAbortOptions,
  type StateTopic,
  type ValueOf,
} from '@sanity/sdk/dashboard'

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
 * The message bus as a service sees it: `emit` and `query` as in the SDK, and
 * `subscribe` for state topics only. Only Dashboard can respond to its event
 * topics, so a service has no reason to subscribe to them. There is no
 * `disconnect`: Dashboard owns the connection and ends it when it stops the
 * worker.
 * @public
 */
export interface ServiceBus extends Omit<MessageBus, 'subscribe'> {
  /** Runs a handler for each state value until its signal aborts. */
  subscribe<K extends StateTopic>(
    type: K,
    handler: (value: ValueOf<K>) => void,
    options?: MessageBusAbortOptions,
  ): void
}

/**
 * Context every service callback receives when its worker starts. Mirrors how a
 * view component receives its `view` — the service receives its own `service`.
 * @public
 */
export interface ServiceContext {
  readonly bus: ServiceBus
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
 * Define a Sanity Dashboard background service. The first argument narrows the
 * callback shape — `"worker"` runs the callback inside a Web Worker.
 *
 * The callback receives `bus`, its connection to the Dashboard message bus:
 * `bus.emit` sends an event (such as a dock-badge update), `bus.query` reads the
 * current value of a state topic, and `bus.subscribe` runs a handler on each
 * new value of a state topic until its `signal` aborts. A refused, unanswered
 * or timed-out request rejects with an `Error` named `MessageBusError` whose
 * `code` says why; it is not an instance of the SDK's `MessageBusError` class.
 * The callback can return a disposer, which runs when Dashboard stops the
 * worker. By then the bus is closed: subscriptions have ended, `emit` and
 * `query` reject with code `ABORTED`, and `subscribe` throws that error.
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

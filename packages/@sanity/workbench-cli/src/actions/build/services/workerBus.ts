// Runs inside the service's Web Worker, bundled by Vite from the generated
// `worker.js`. Keep it free of Node and of runtime imports: `@sanity/sdk` is
// only ever imported for types.
import {type MessageBusEmitResult, type MessageBusErrorCode} from '@sanity/sdk/dashboard'

import {type ServiceBus} from '../../../defineService.js'

const DEFAULT_TIMEOUT_MS = 5000

interface RequestOptions {
  signal?: AbortSignal
  timeout?: number | null
}

type Outcome = {error: Error; ok: false} | {ok: true; value: unknown}

type HostMessage =
  | {
      error: {code: MessageBusErrorCode; message: string}
      id: number
      kind: 'workbench.bus.reply'
      ok: false
    }
  | {id: number; kind: 'workbench.bus.reply'; ok: true; value: unknown}
  | {id: number; kind: 'workbench.bus.value'; value: unknown}

// Mirrors the SDK's MessageBusError: importing the class would pull the SDK
// runtime into the worker bundle.
const busError = (code: MessageBusErrorCode, message?: string): Error =>
  Object.assign(new Error(message || code), {code, name: 'MessageBusError'})

/**
 * The worker's side of the `workbench.bus.*` wire contract. The host relays
 * each request to the Dashboard bus and stamps it with the worker's identity,
 * so the client only tracks ids.
 * @internal
 */
export function createWorkerBus(): {
  /**
   * The service author's API. The host owns the connection, opening it and ending it when
   * it terminates the worker, so the worker cannot end it.
   */
  bus: ServiceBus
  /**
   * The generated entry's terminate hook, not the author's. It sends nothing to
   * the host, which has already disconnected; it only marks the client closed so
   * the disposer's bus calls reject `ABORTED` at once instead of waiting out the
   * local timeout. Hence not `disconnect`.
   */
  close: () => void
  /**
   * The generated `worker.js` is the single `message` listener on `self` and
   * routes every kind (terminate to the disposer, `workbench.bus.*` here), the
   * way the host's `runWorker` routes to its relay.
   */
  receive: (data: unknown) => void
} {
  const pending = new Map<number, (outcome: Outcome) => void>()
  const subscriptions = new Map<number, (value: unknown) => void>()
  let nextId = 0
  let closed = false

  // Posts a request and returns a function that creates its promise on first
  // call. Until then a reply, even an error, is only held: a rejected promise
  // nobody awaits would reach the worker's 'unhandledrejection' forwarder as a crash.
  function request(message: Record<string, unknown>, options: RequestOptions = {}) {
    const {signal, timeout} = options
    const id = ++nextId
    let outcome: Outcome | undefined
    let onOutcome: ((result: Outcome) => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = (result: Outcome) => {
      if (outcome) return
      outcome = result
      clearTimeout(timer)
      pending.delete(id)
      signal?.removeEventListener('abort', onAbort)
      onOutcome?.(result)
    }
    const onAbort = () => {
      self.postMessage({id, kind: 'workbench.bus.abort'})
      settle({error: busError('ABORTED'), ok: false})
    }

    if (closed || signal?.aborted) {
      outcome = {error: busError('ABORTED'), ok: false}
    } else {
      // An omitted timeout must stay absent on the wire, so the host applies its default.
      self.postMessage(timeout === undefined ? {...message, id} : {...message, id, timeout})
      pending.set(id, settle)
      // A host that predates the bus never replies; time out here too so the call still settles.
      if (timeout !== null) {
        timer = setTimeout(
          () => settle({error: busError('TIMEOUT'), ok: false}),
          timeout ?? DEFAULT_TIMEOUT_MS,
        )
      }
      signal?.addEventListener('abort', onAbort, {once: true})
    }

    let promise: Promise<unknown> | undefined
    return () =>
      (promise ??= new Promise((resolve, reject) => {
        onOutcome = (result) => (result.ok ? resolve(result.value) : reject(result.error))
        if (outcome) onOutcome(outcome)
      }))
  }

  const bus = {
    emit: (topic: string, payload?: unknown, options?: RequestOptions) => {
      const awaitReply = request({kind: 'workbench.bus.emit', payload, topic}, options)
      const result: MessageBusEmitResult<unknown> = {
        catch: (onRejected) => awaitReply().then(undefined, onRejected),
        finally: (onFinally) => awaitReply().finally(onFinally),
        // eslint-disable-next-line unicorn/no-thenable -- awaiting arms reply failure handling; fire-and-forget does not.
        then: (onFulfilled, onRejected) => awaitReply().then(onFulfilled, onRejected),
      }
      return result
    },
    query: (topic: string, options?: RequestOptions) =>
      request({kind: 'workbench.bus.query', topic}, options)(),
    subscribe: (topic: string, handler: (value: unknown) => void, options?: RequestOptions) => {
      if (closed) throw busError('ABORTED')
      const signal = options?.signal
      if (signal?.aborted) return
      const id = ++nextId
      self.postMessage({id, kind: 'workbench.bus.subscribe', topic})
      subscriptions.set(id, handler)
      signal?.addEventListener(
        'abort',
        () => {
          if (subscriptions.delete(id)) self.postMessage({id, kind: 'workbench.bus.abort'})
        },
        {once: true},
      )
    },
  }

  return {
    // The topic generics only exist at the call site; the wire carries plain strings.
    bus: bus as unknown as ServiceBus,
    close: () => {
      closed = true
      subscriptions.clear()
      for (const settle of pending.values()) settle({error: busError('ABORTED'), ok: false})
    },
    receive: (data) => {
      const message = data as HostMessage
      if (message.kind === 'workbench.bus.value') {
        subscriptions.get(message.id)?.(message.value)
      } else if (message.kind === 'workbench.bus.reply') {
        const settle = pending.get(message.id)
        if (message.ok) {
          settle?.({ok: true, value: message.value})
          return
        }
        // A refused subscription has no promise to reject, so tell the author through the host logger.
        if (subscriptions.delete(message.id)) {
          // eslint-disable-next-line no-console -- the worker's console is bridged to the host logger
          console.error(
            `Message bus subscription refused: ${message.error.code}: ${message.error.message}`,
          )
        }
        settle?.({error: busError(message.error.code, message.error.message), ok: false})
      }
    },
  }
}

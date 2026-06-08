interface SharedState {
  promise: Promise<void>
  refCount: number
}
export function getShared(key: symbol): SharedState | undefined {
  return (globalThis as Record<symbol, unknown>)[key] as SharedState | undefined
}
export function setShared(key: symbol, state: SharedState | undefined): void {
  ;(globalThis as Record<symbol, unknown>)[key] = state
}

import {performance} from 'node:perf_hooks'

export interface TimeMeasurer {
  end: (name: string) => number
  getTimings: () => Record<string, number>
  start: (name: string) => void
}

export function getTimer(): TimeMeasurer {
  const timings: Record<string, number> = {}
  const startTimes: Record<string, number> = {}

  function start(name: string): void {
    if (startTimes[name] !== undefined) {
      throw new TypeError(`Timer "${name}" already started, cannot overwrite`)
    }

    startTimes[name] = performance.now()
  }

  function end(name: string): number {
    if (startTimes[name] === undefined) {
      throw new TypeError(`Timer "${name}" never started, cannot end`)
    }

    timings[name] = performance.now() - startTimes[name]
    return timings[name]
  }

  return {end, getTimings: () => timings, start}
}

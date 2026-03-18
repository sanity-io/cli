import {createDebugFactory} from '../createDebug.js'
import {browserEnv} from '../env/browser.js'

export type {DebugEntry, DebugFunction, Formatter} from '../types.js'

const {createDebug, disable, enable, enabled, formatters} = createDebugFactory(browserEnv)

export {createDebug, disable, enable, enabled, formatters}

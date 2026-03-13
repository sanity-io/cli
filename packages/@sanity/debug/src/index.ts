import {createDebugFactory} from './createDebug.js'
import {nodeEnv} from './env/node.js'

export type {DebugFunction, Formatter} from './types.js'

const {createDebug, disable, enable, enabled, formatters} = createDebugFactory(nodeEnv)

export {createDebug, disable, enable, enabled, formatters}

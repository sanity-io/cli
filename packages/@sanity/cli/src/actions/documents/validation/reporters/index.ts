import {json} from './jsonReporter.js'
import {ndjson} from './ndjsonReporter.js'
import {pretty} from './prettyReporter/index.js'

export const reporters = {json, ndjson, pretty}

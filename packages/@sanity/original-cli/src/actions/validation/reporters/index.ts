import {json} from './jsonReporter.js'
import {ndjson} from './ndjsonReporter.js'
import {pretty} from './prettyReporter.js'

export const reporters = {pretty, ndjson, json}

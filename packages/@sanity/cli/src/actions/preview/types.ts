import {PreviewCommand} from '../../commands/preview.js'
import {StartCommand} from '../../commands/start.js'

type StartFlags = StartCommand['flags']
type PreviewFlags = PreviewCommand['flags']

// Both commands have identical flag structures, so we can use either
export type ServerFlags = PreviewFlags | StartFlags

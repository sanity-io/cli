import {describe} from 'vitest'

import {registerStudioInitTests} from './init.studio.shared.js'

describe('sanity init - studio (with -y flag)', {timeout: 120_000}, () => {
  registerStudioInitTests(['-y'])
})

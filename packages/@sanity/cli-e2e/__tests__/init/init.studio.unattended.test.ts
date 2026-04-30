import {describe} from 'vitest'

import {registerStudioInitTests} from './init.studio.shared.js'

describe('sanity init - studio (unattended, no -y)', {timeout: 120_000}, () => {
  registerStudioInitTests([])
})

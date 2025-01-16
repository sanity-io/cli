import {mockBrowserEnvironment} from '../util/mockBrowserEnvironment.js'

mockBrowserEnvironment(
  // eslint-disable-next-line no-process-env
  process.env.SANITY_BASE_PATH || process.cwd(),
)

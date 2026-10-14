import {plugins} from './transform'

export default {
  vite: (config) => ({...config, plugins: [...config.plugins, ...plugins]}),
}

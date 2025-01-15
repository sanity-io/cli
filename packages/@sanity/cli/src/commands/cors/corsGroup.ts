import type {CliCommandGroupDefinition} from '../../types.js'

const corsGroup: CliCommandGroupDefinition = {
  name: 'cors',
  signature: '[COMMAND]',
  isGroupRoot: true,
  description: 'Configures CORS settings for Sanity projects',
}

export default corsGroup

import type {CliCommandGroupDefinition} from '../../types.js'

export const usersGroup: CliCommandGroupDefinition = {
  name: 'users',
  signature: '[COMMAND]',
  isGroupRoot: true,
  description: 'Manages users of your Sanity project',
}

export default usersGroup

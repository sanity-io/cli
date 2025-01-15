import {definePlugin} from 'sanity'
import {CustomDefaultLayout} from './CustomDefaultLayout.js'

export const getStartedPlugin = definePlugin({
  name: 'sanity-plugin-tutorial',
  studio: {
    components: {
      layout: CustomDefaultLayout,
    },
  },
})

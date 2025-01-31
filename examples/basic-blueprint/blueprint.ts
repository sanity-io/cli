import {defineBlueprint, defineDataset} from '@sanity/blueprints'

export default defineBlueprint({
  resources: [
    defineDataset({
      name: 'production',
    }),
  ],
})

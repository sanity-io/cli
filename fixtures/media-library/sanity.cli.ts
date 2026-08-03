// `unstable_defineMediaLibrary` comes from `@sanity/cli` (workspace) until the
// `sanity` package ships its `sanity/cli` re-export — the published `lib/cli.js`
// only re-exports the symbols it knew at publish time.
import {defineCliConfig, unstable_defineMediaLibrary} from '@sanity/cli'

export default defineCliConfig({
  app: unstable_defineMediaLibrary({
    fields: [
      {
        name: 'description',
        public: true,
        src: './src/description.ts',
        title: 'Description',
      },
      {
        name: 'language',
        src: './src/language.ts',
        title: 'Language',
      },
    ],
    organizationId: 'o0jkwp3lb',
  }),
})

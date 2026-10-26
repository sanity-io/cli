import {type ProjectTemplate} from '../types.js'

/**
 * Media Library config app: field (aspect) definitions for an organization's
 * Media Library, bundled into a federated remote with island-rendered custom
 * inputs. Unlisted — reachable only as `sanity init` with the template flag
 * set to `media-library-config`, not offered in the template prompt.
 *
 * Brings its own dependency set (neither the SDK-app nor the studio base
 * applies): field modules import `sanity` and `@sanity/ui` directly, and the
 * island runtime the build bundles first shipped in `sanity` 6.20.0
 * (`sanity/media-library-island-runtime`), which the range pins as the floor.
 */
const mediaLibraryConfigTemplate: ProjectTemplate = {
  dependencies: {
    // Matches the @sanity/ui major `sanity` itself depends on, so one copy
    // serves both the field modules and the studio dependency tree.
    '@sanity/ui': '^4.4.10',
    // The react floor @sanity/ui 4 and sanity 6.20 peer-require.
    react: '^19.2.2',
    'react-dom': '^19.2.2',
    sanity: '^6.20.0',
    // Peer of both `sanity` and `@sanity/ui`, imported by @sanity/ui at
    // runtime and bundled into the island build — declared explicitly because
    // installs without auto-installed peers would fail at runtime. (Sanity's
    // own monorepos swap it for the `@sanity/css-in-js` fork via a pnpm
    // override; a scaffolded project has no override, so it needs the real
    // package.)
    'styled-components': '^6.1.18',
  },
  devDependencies: {
    '@sanity/eslint-config-studio': '^7',
    '@types/react': '^19',
    '@types/react-dom': '^19',
    eslint: '^10',
    // typescript-eslint (via eslint-config-studio) only supports TypeScript up to 6.0.x
    typescript: '~6.0',
    // The scaffolded eslint.config.mjs imports it directly (plugin declaration
    // for the restricted-imports override). Same range eslint-config-studio
    // uses, so npm dedupes to one instance — a second copy would make the
    // plugin redefinition conflict.
    'typescript-eslint': '^8',
  },
  scripts: {
    build: 'sanity build',
    deploy: 'sanity deploy',
    dev: 'sanity dev',
  },
  type: 'module',
  typescriptOnly: true,
}

export default mediaLibraryConfigTemplate

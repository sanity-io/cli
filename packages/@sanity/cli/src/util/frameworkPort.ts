const FALLBACK_PORT = 3000

const portMap: Record<string, number> = {
  angular: 4200,
  astro: 4321,
  blitzjs: 3000,
  brunch: 3333,
  'create-react-app': 3000,
  docusaurus: 3000,
  'docusaurus-2': 3000,
  dojo: 3000,
  eleventy: 8080,
  ember: 4200,
  fasthtml: 8000,
  gatsby: 8000,
  gridsome: 8080,
  hexo: 4000,
  hugo: 1313,
  hydrogen: 3000,
  'ionic-angular': 4200,
  'ionic-react': 3000,
  jekyll: 4000,
  middleman: 4567,
  nextjs: 3000,
  nuxtjs: 3000,
  parcel: 1234,
  polymer: 8081,
  preact: 8080,
  redwoodjs: 8910,
  remix: 3000,
  saber: 3000,
  sanity: 3333,
  scully: 1668,
  solidstart: 3000,
  'solidstart-1': 3000,
  stencil: 3333,
  storybook: 6006,
  svelte: 5000,
  sveltekit: 5173,
  'sveltekit-1': 5173,
  umijs: 8000,
  vite: 5173,
  vitepress: 5173,
  vue: 8080,
  vuepress: 8080,
  zola: 1111,
}

/**
 * Returns the default development port for a given framework.
 * Contains default ports for all frameworks supported by `@vercel/frameworks`.
 * Falls back to port 3000 if framework is not found or not specified.
 *
 * @see https://github.com/vercel/vercel/blob/main/packages/frameworks/src/frameworks.ts
 * for the complete list of supported frameworks
 *
 * @param frameworkSlug - The framework identifier from `@vercel/frameworks`
 * @returns The default port number for the framework
 */
export function getDefaultPortForFramework(frameworkSlug?: string | null): number {
  return portMap[frameworkSlug ?? ''] ?? FALLBACK_PORT
}

import {type Plugin} from 'vite'

export interface StandaloneVendorBuild {
  entries: Record<string, string>
  fileName: string
  plugins: Plugin[]
}

export function sanityStandaloneVendor({
  entries,
  fileName,
  plugins,
}: StandaloneVendorBuild): Plugin {
  return {
    api: {sanityStandaloneVendor: true},
    applyToEnvironment: (env) =>
      env.name === 'client' && [
        ...plugins,
        {
          buildStart() {
            for (const [name, id] of Object.entries(entries)) {
              this.emitFile({id, name, type: 'chunk'})
            }
          },
          name: 'sanity/standalone-vendor-entries',
          outputOptions: ({chunkFileNames = 'static/[name]-[hash].js', ...options}) => ({
            ...options,
            chunkFileNames: (chunk) => {
              if (chunk.name in entries) return fileName

              return typeof chunkFileNames === 'function' ? chunkFileNames(chunk) : chunkFileNames
            },
            exports: 'named',
          }),
        },
      ],
    configEnvironment: (name) =>
      name === 'client'
        ? {
            build: {
              rolldownOptions: {
                experimental: {nativeMagicString: true},
                preserveEntrySignatures: 'exports-only',
              },
            },
          }
        : undefined,
    name: 'sanity/standalone-vendor',
  }
}

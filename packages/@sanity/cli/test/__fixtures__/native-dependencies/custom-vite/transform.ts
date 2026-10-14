export const plugins = [
  {
    name: 'custom-dependency-transform',
    transform(code: string, id: string) {
      if (id.endsWith('/dep/index.mjs')) return code.replace('original', 'transformed')
    },
  },
]

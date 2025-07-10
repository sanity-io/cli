import {type Plugin} from 'vite'

export function sanityRuntimeRewritePlugin(): Plugin {
  return {
    apply: 'serve',
    configureServer(viteDevServer) {
      return () => {
        viteDevServer.middlewares.use((req, res, next) => {
          if (req.url === '/index.html') {
            req.url = '/.sanity/runtime/index.html'
          }

          next()
        })
      }
    },
    name: 'sanity/server/sanity-runtime-rewrite',
  }
}

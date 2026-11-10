interface RouteInit {
  body?: Record<string, unknown>
  params?: Record<string, string>
  query?: Record<string, string>
}

/**
 * A stand-in for `client.context.request` that answers each route with its
 * handler, and rejects a route the test didn't expect
 */
export function contextRoutes(routes: Record<string, (init: RouteInit) => unknown>) {
  return async (route: string, init: RouteInit = {}) => {
    const handler = routes[route]
    if (!handler) throw new Error(`Unexpected Context API request: ${route}`)
    return handler(init)
  }
}

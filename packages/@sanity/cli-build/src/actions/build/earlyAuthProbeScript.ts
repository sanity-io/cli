// Browser-side early-auth probe.
//
// This module is authored as real TypeScript and transformed at studio-build
// time (see decorateIndexWithEarlyAuthScript) for inlining into index.html. It
// runs during HTML parse, before the multi-MB module bundle evaluates, firing
// a `/users/me` request and parking the result on `window.__sanityEarlyAuth`
// for the monorepo consumer to pick up.
//
// CRITICAL: keep this file fully self-contained — zero value imports. The
// transform step inlines the output verbatim (it transforms, it does not
// bundle), so a value import would ship a broken ESM `import` statement into
// the HTML.
//
// The `v2026-05-04` path segment below must stay in sync with AUTH_API_VERSION
// in the sanity monorepo (packages/sanity/src/core/store/authStore/constants.ts).

interface EarlyAuthOk {
  type: 'ok'
  user: unknown
}

interface EarlyAuthUnauthenticated {
  type: 'unauthenticated'
}

interface EarlyAuthError {
  status: number
  type: 'error'
}

type EarlyAuthResult = EarlyAuthError | EarlyAuthOk | EarlyAuthUnauthenticated

interface EarlyAuthState {
  apiHost: string
  credential: 'cookie' | 'token'
  projectId: string
  promise: Promise<EarlyAuthResult>
  startedAt: number
  token: string | null
}

export function __sanityEarlyAuthInit(projectId: string, apiHost: string): void {
  try {
    const storageKey = '__studio_auth_token_' + projectId

    let token: string | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        token = parsed && parsed.token ? parsed.token : null
      }
    } catch {
      token = null
    }

    const requestUrl =
      'https://' +
      projectId +
      '.' +
      apiHost +
      '/v2026-05-04/users/me?tag=sanity.studio.auth.early-probe'

    const requestOptions: RequestInit = token
      ? {headers: {Authorization: 'Bearer ' + token}}
      : {credentials: 'include'}

    const startedAt = Date.now()

    const promise: Promise<EarlyAuthResult> = fetch(requestUrl, requestOptions).then((response) => {
      if (response.status === 401) {
        return {type: 'unauthenticated'}
      }
      if (response.ok) {
        return response.json().then((user) => ({type: 'ok', user}))
      }
      return {status: response.status, type: 'error'}
    })

    const state: EarlyAuthState = {
      apiHost,
      credential: token ? 'token' : 'cookie',
      projectId,
      promise,
      startedAt,
      token: token || null,
    }

    // eslint-disable-next-line unicorn/prefer-global-this -- the monorepo consumer reads `window.__sanityEarlyAuth`; the assignment target must stay `window`
    ;(window as unknown as {__sanityEarlyAuth?: EarlyAuthState}).__sanityEarlyAuth = state
  } catch {
    // Any failure leaves window.__sanityEarlyAuth unset - a clean miss.
  }
}

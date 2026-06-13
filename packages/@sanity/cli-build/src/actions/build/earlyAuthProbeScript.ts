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
// the HTML. Configuration values (API version, request tag, storage-key
// prefix) are therefore passed in as arguments by the decorator, which owns
// them in earlyAuthProbeConstants.ts.

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

const UNAUTHORIZED_STATUS = 401

function readStoredToken(storageKey: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    return parsed && parsed.token ? parsed.token : null
  } catch {
    return null
  }
}

export function __sanityEarlyAuthInit(
  projectId: string,
  apiHost: string,
  apiVersion: string,
  requestTag: string,
  tokenStorageKeyPrefix: string,
): void {
  try {
    const token = readStoredToken(tokenStorageKeyPrefix + projectId)

    const requestUrl =
      'https://' + projectId + '.' + apiHost + '/' + apiVersion + '/users/me?tag=' + requestTag

    const requestOptions: RequestInit = token
      ? {headers: {Authorization: 'Bearer ' + token}}
      : {credentials: 'include'}

    const startedAt = Date.now()

    const promise: Promise<EarlyAuthResult> = fetch(requestUrl, requestOptions).then((response) => {
      if (response.status === UNAUTHORIZED_STATUS) {
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

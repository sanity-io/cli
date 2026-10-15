import {join} from 'node:path'

import {getLocalPackageDir, readPackageJson} from '@sanity/cli-core/package-manager'

/**
 * The version of the auth hash stash contract this script implements. A `sanity` release that
 * reads `globalThis.__SANITY_AUTH_HASH_PARAMS__` declares it in its `package.json` as
 * `"sanityCliCapabilities": {"authHashStash": 1}` (added by sanity-io/sanity#15337). Any other
 * value is a contract this script does not implement.
 */
const AUTH_HASH_STASH_CAPABILITY = 1

/**
 * Whether the `sanity` package installed in `cwd` reads the auth params stashed by the auth hash
 * script. Older studios only read the URL hash, so stripping the params would break their login.
 * Fails closed: returns `false` when the capability is missing, has another value, or the
 * package cannot be read.
 *
 * @internal
 */
export async function sanityReadsAuthHashStash(cwd: string): Promise<boolean> {
  try {
    const manifest = await readPackageJson(join(getLocalPackageDir('sanity', cwd), 'package.json'))
    const capabilities: unknown = manifest.sanityCliCapabilities
    return (
      typeof capabilities === 'object' &&
      capabilities !== null &&
      'authHashStash' in capabilities &&
      capabilities.authHashStash === AUTH_HASH_STASH_CAPABILITY
    )
  } catch {
    return false
  }
}

/**
 * Removes the `sid`, `token` and `claim` params from the URL hash and stores their raw values
 * on `globalThis.__SANITY_AUTH_HASH_PARAMS__`, where the studio reads them. Running this before
 * the bundle means the secrets are gone from the address bar even if the bundle fails to load.
 */
const authHashScript = `try {
  var params = location.hash.slice(1).split('&');
  var kept = params.filter(function (param) {
    var match = /^(sid|token|claim)=(.*)$/.exec(param);
    if (!match) return true;
    var found = (globalThis.__SANITY_AUTH_HASH_PARAMS__ = globalThis.__SANITY_AUTH_HASH_PARAMS__ || {});
    if (!(match[1] in found)) found[match[1]] = match[2];
    return false;
  });
  if (kept.length !== params.length) {
    history.replaceState(history.state, '', location.pathname + location.search + (kept.length ? '#' + kept.join('&') : ''));
  }
} catch (err) {}`

/**
 * Decorates the given HTML template with a script tag that removes auth
 * secrets from the URL hash. The script is injected as the first child
 * of `<head>` so it runs before any other script. Studio documents only:
 * apps rely on `@sanity/sdk` reading `sid` from the hash itself, and only
 * when {@link sanityReadsAuthHashStash} confirms the studio reads the stashed params.
 *
 * @internal
 */
export function decorateIndexWithAuthHashScript(template: string): string {
  return template.replace(
    /<head([^>]*)>/,
    (_, attributes) => `<head${attributes}>\n<script>${authHashScript}</script>`,
  )
}

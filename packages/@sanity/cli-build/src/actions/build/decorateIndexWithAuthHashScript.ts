import {gte, parse} from 'semver'

/**
 * The first `sanity` release that reads `globalThis.__SANITY_AUTH_HASH_PARAMS__`
 * (sanity-io/sanity#15337). Older studios only read the URL hash, so stripping the params
 * would break their login. Must match the release that ships that PR.
 *
 * @internal
 */
export const MIN_SANITY_VERSION_READING_AUTH_HASH_STASH = '6.19.0'

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
 * apps rely on `@sanity/sdk` reading `sid` from the hash itself. Returns
 * the template unchanged unless `sanityVersion` reads the stashed params.
 *
 * @internal
 */
export function decorateIndexWithAuthHashScript(
  template: string,
  sanityVersion: string | null,
): string {
  const parsed = sanityVersion ? parse(sanityVersion) : null
  if (!parsed || !gte(parsed, MIN_SANITY_VERSION_READING_AUTH_HASH_STASH)) {
    return template
  }

  return template.replace(
    /<head([^>]*)>/,
    (_, attributes) => `<head${attributes}>\n<script>${authHashScript}</script>`,
  )
}

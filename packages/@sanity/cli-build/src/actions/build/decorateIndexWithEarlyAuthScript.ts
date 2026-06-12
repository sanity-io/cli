import {isStaging} from '@sanity/cli-core'

/**
 * Decorates the given HTML template with an inline ES5 script that fires a
 * `/users/me` fetch during HTML parse, before the multi-MB module bundle
 * evaluates. The result is parked on `window.__sanityEarlyAuth` for the
 * monorepo consumer to pick up and validate.
 *
 * Injected as the first child of `<head>` so it runs before any other scripts.
 * Returns the template unchanged when `projectId` is absent, empty, or
 * sanitizes to empty.
 *
 * @internal
 */
export function decorateIndexWithEarlyAuthScript(
  template: string,
  projectId: string | undefined,
): string {
  const sanitizedProjectId = (projectId ?? '').replaceAll(/[^a-zA-Z0-9]/g, '')

  if (!template || !sanitizedProjectId) {
    return template
  }

  const apiHost = isStaging() ? 'api.sanity.work' : 'api.sanity.io'

  // ES5 string constant — SWC compiles the surrounding TypeScript but the
  // contents of this string ship byte-for-byte into the built index.html.
  // JSON.stringify provides safe interpolation of the two build-time values.

  const script =
    `function __sanityEarlyAuthInit(pid,host){` +
    `try{` +
    `var lsKey='__studio_auth_token_'+pid;` +
    `var stored;` +
    `try{var raw=localStorage.getItem(lsKey);if(raw){stored=JSON.parse(raw)}}catch(lsErr){}` +
    `var tok=stored&&stored.token;` +
    `var url='https://'+pid+'.'+host+'/v2026-05-04/users/me?tag=sanity.studio.auth.early-probe';` +
    `var opts=tok?{headers:{Authorization:'Bearer '+tok}}:{credentials:'include'};` +
    `var ts=Date.now();` +
    `var probe=fetch(url,opts).then(function(res){` +
    `if(res.status===401){return{type:'unauthenticated'}}` +
    `if(!res.ok){return{type:'error',status:res.status}}` +
    `return res.json().then(function(user){return{type:'ok',user:user}})` +
    `});` +
    `window.__sanityEarlyAuth={` +
    `projectId:pid,apiHost:host,` +
    `credential:tok?'token':'cookie',` +
    `token:tok||null,startedAt:ts,promise:probe` +
    `}` +
    `}catch(initErr){}}` +
    `\ntry{__sanityEarlyAuthInit(${JSON.stringify(sanitizedProjectId)},${JSON.stringify(apiHost)})}catch(initError){}`

  return template.replace(/<head([^>]*)>/, `<head$1>\n<script>${script}</script>`)
}

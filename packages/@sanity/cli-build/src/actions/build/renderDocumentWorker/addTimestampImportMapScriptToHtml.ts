import {parse as parseHtml} from 'node-html-parser'

/**
 * This script takes the import map from the `#__imports` script tag,
 * modifies relevant URLs that match the sanity-cdn hostname by replacing
 * the existing timestamp in the sanity-cdn URLs with a new runtime timestamp,
 * and injects the modified import map back into the HTML.
 *
 * It also synchronously creates `<link rel="stylesheet">` tags for each CDN
 * CSS URL with a fresh timestamp.
 *
 * This will be injected into the HTML of the user's bundle.
 *
 * Note that this is in a separate constants file to prevent "Cannot access
 * before initialization" errors.
 */
const TIMESTAMPED_IMPORTMAP_INJECTOR_SCRIPT = `<script>
  // auto-generated script to add import map with timestamp
  const importsJson = document.getElementById('__imports')?.textContent;
  const { imports = {}, css = [], ...rest } = importsJson ? JSON.parse(importsJson) : {};
  const importMapEl = document.createElement('script');
  importMapEl.type = 'importmap';
  const newTimestamp = \`/t\${Math.floor(Date.now() / 1000)}\`;

  function replaceTimestamp(urlStr) {
    try {
      const url = new URL(urlStr);
      if (/^sanity-cdn\\.[a-zA-Z]+$/.test(url.hostname)) {
        url.pathname = url.pathname.replace(/\\/t\\d+/, newTimestamp);
      }
      return url.toString();
    } catch {
      return urlStr;
    }
  }

  function isSanityCdnUrl(urlStr) {
    try {
      return /^sanity-cdn\\.[a-zA-Z]+$/.test(new URL(urlStr).hostname);
    } catch {
      return false;
    }
  }

  importMapEl.textContent = JSON.stringify({
    imports: Object.fromEntries(
      Object.entries(imports).map(([specifier, path]) => [specifier, replaceTimestamp(path)])
    ),
    ...rest,
  });
  document.head.appendChild(importMapEl);

  // Creates <link rel="stylesheet"> tags with fresh timestamps.
  for (const cssUrl of css) {
    const linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    linkEl.href = replaceTimestamp(cssUrl);
    document.head.appendChild(linkEl);
  }

  // Warm the CDN module connection during head parse so the cross-origin
  // \`sanity\` fetch can start before the entry script discovers the import.
  const firstCdnImport = Object.values(imports).find(isSanityCdnUrl);

  if (firstCdnImport) {
    const preconnectEl = document.createElement('link');
    preconnectEl.rel = 'preconnect';
    preconnectEl.href = new URL(firstCdnImport).origin;
    // Module fetches are CORS; without crossorigin the warmed socket is not reused.
    preconnectEl.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectEl);
  }

  // Start downloading the timestamped \`sanity\` module during head parse. The
  // href reuses replaceTimestamp so it matches the importmap entry exactly —
  // a stale timestamp here would double-fetch the largest chunk.
  const sanityModuleUrl = imports['sanity'];
  if (typeof sanityModuleUrl === 'string' && isSanityCdnUrl(sanityModuleUrl)) {
    const preloadEl = document.createElement('link');
    preloadEl.rel = 'modulepreload';
    preloadEl.href = replaceTimestamp(sanityModuleUrl);
    // Must match the preconnect's credentials mode, otherwise the browser
    // treats them as separate connections and the warmed cross-origin socket
    // is not reused for this fetch.
    preloadEl.crossOrigin = 'anonymous';
    document.head.appendChild(preloadEl);
  }
</script>`

/**
 * @internal
 */
export function addTimestampedImportMapScriptToHtml(
  html: string,
  importMap?: {imports?: Record<string, string>},
  autoUpdatesCssUrls?: string[],
): string {
  if (!importMap) return html

  let root = parseHtml(html)
  let htmlEl = root.querySelector('html')
  if (!htmlEl) {
    const oldRoot = root
    root = parseHtml('<html></html>')
    htmlEl = root.querySelector('html')!
    htmlEl.append(oldRoot)
  }

  let headEl = htmlEl.querySelector('head')

  if (!headEl) {
    htmlEl.insertAdjacentHTML('afterbegin', '<head></head>')
    headEl = root.querySelector('head')!
  }

  // Include CSS URLs in the __imports JSON so the runtime script can create
  // <link> tags with fresh timestamps synchronously during head parsing.
  const importMapWithCss =
    autoUpdatesCssUrls && autoUpdatesCssUrls.length > 0
      ? {...importMap, css: autoUpdatesCssUrls}
      : importMap

  headEl.insertAdjacentHTML(
    'beforeend',
    `<script type="application/json" id="__imports">${JSON.stringify(importMapWithCss)}</script>`,
  )

  headEl.insertAdjacentHTML('beforeend', TIMESTAMPED_IMPORTMAP_INJECTOR_SCRIPT)
  return root.outerHTML
}

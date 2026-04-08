import {parse as parseHtml} from 'node-html-parser'

/**
 * This script takes the import map from the `#__imports` script tag,
 * modifies relevant URLs that match the sanity-cdn hostname by replacing
 * the existing timestamp in the sanity-cdn URLs with a new runtime timestamp,
 * and injects the modified import map back into the HTML.
 *
 * This will be injected into the HTML of the user's bundle.
 *
 * Note that this is in a separate constants file to prevent "Cannot access
 * before initialization" errors.
 */
const TIMESTAMPED_IMPORTMAP_INJECTOR_SCRIPT = `<script>
  // auto-generated script to add import map with timestamp
  var importsData;
  try {
    var importsJson = document.getElementById('__imports')?.textContent;
    importsData = importsJson ? JSON.parse(importsJson) : {};
  } catch (e) {
    console.warn('Failed to parse __imports JSON:', e);
    importsData = {};
  }
  var imports = importsData.imports || {};
  var css = importsData.css || [];
  var newTimestamp = \`/t\${Math.floor(Date.now() / 1000)}\`;

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

  // Create import map with updated timestamps
  const importMapEl = document.createElement('script');
  importMapEl.type = 'importmap';
  const importMapData = Object.assign({}, importsData);
  delete importMapData.css;
  importMapData.imports = Object.fromEntries(
    Object.entries(imports).map(([specifier, path]) => [specifier, replaceTimestamp(path)])
  );
  importMapEl.textContent = JSON.stringify(importMapData);
  document.head.appendChild(importMapEl);

  // Create <link> tags for CDN CSS with updated timestamps
  css.forEach(function(cssUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = replaceTimestamp(cssUrl);
    document.head.appendChild(link);
  });
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

  const importsData =
    autoUpdatesCssUrls && autoUpdatesCssUrls.length > 0
      ? {...importMap, css: autoUpdatesCssUrls}
      : importMap

  headEl.insertAdjacentHTML(
    'beforeend',
    `<script type="application/json" id="__imports">${JSON.stringify(importsData)}</script>`,
  )
  headEl.insertAdjacentHTML('beforeend', TIMESTAMPED_IMPORTMAP_INJECTOR_SCRIPT)
  return root.outerHTML
}

import {
  DEFERRED_MODULE_SCRIPT_TYPE,
  DEFERRED_MODULEPRELOAD_REL,
  ENTRY_SCRIPT_ATTRIBUTE,
} from '../deferModuleScripts.js'

/**
 * Loads today's Module Server map when it answers, otherwise the build's pinned bucket map;
 * reloads once into pinned if the studio entry then fails to load.
 *
 * @internal
 */
export const MODULE_SERVER_FALLBACK_SCRIPT = String.raw`<script>
{
  const PROBE_TIMEOUT_MS = 4000;
  const STALL_IDLE_MS = 10000;
  const STALL_MAX_MS = 30000;
  const RECOVERY_WINDOW_MS = 60000;
  const NOTICE_ID = '__sanityModuleNotice';

  // Per studio, so basePath studios on one origin don't share it.
  const studioScope = location.pathname.split('/')[1] || '';
  const RECOVERY_STORAGE_KEY = 'sanity:module-server-fallback' + (studioScope ? ':' + studioScope : '');

  const config = JSON.parse(document.getElementById('__imports').textContent);
  const timestampSegment = '/t' + Math.floor(Date.now() / 1000);

  const isSanityCdnHost = (hostname) => /^sanity-cdn\.[a-zA-Z]+$/.test(hostname);

  const withCurrentTimestamp = (urlString) => {
    try {
      const url = new URL(urlString);
      if (isSanityCdnHost(url.hostname)) {
        url.pathname = url.pathname.replace(/\/t\d+/, timestampSegment);
      }
      return url.toString();
    } catch {
      return urlString;
    }
  };

  const moduleServerPlan = {
    css: (config.css || []).map(withCurrentTimestamp),
    imports: Object.fromEntries(
      Object.entries(config.imports || {}).map(([specifier, url]) => [specifier, withCurrentTimestamp(url)]),
    ),
    source: 'module-server',
  };
  const pinnedPlan = {css: config.pinned.css, imports: config.pinned.imports, source: 'pinned'};

  const readRecoveryTime = () => {
    try {
      return Number(sessionStorage.getItem(RECOVERY_STORAGE_KEY)) || 0;
    } catch {
      return 0;
    }
  };

  const markRecoveryReload = () => {
    try {
      const now = String(Date.now());
      sessionStorage.setItem(RECOVERY_STORAGE_KEY, now);
      return sessionStorage.getItem(RECOVERY_STORAGE_KEY) === now;
    } catch {
      return false;
    }
  };

  const sinceRecovery = Date.now() - readRecoveryTime();
  const isRecovering = sinceRecovery >= 0 && sinceRecovery < RECOVERY_WINDOW_MS;

  const appendToHead = (tagName, attributes, textContent) => {
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.textContent = textContent || '';
    document.head.appendChild(element);
  };

  const originOf = (urlString) => {
    try {
      return new URL(urlString).origin;
    } catch {
      return null;
    }
  };

  new Set([moduleServerPlan.imports.sanity, pinnedPlan.imports.sanity].map(originOf)).forEach((origin) => {
    if (origin) appendToHead('link', {crossorigin: 'anonymous', href: origin, rel: 'preconnect'});
  });

  const probeModuleServer = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const probeUrl = moduleServerPlan.imports.sanity;
    const probeOrigin = originOf(probeUrl);

    // A connect-src block would pin a healthy studio forever; the violation event lands after the rejection.
    let blockedByCsp = false;
    const onViolation = (event) => {
      const matchesProbe =
        event.blockedURI === probeUrl ||
        (event.effectiveDirective === 'connect-src' && originOf(event.blockedURI) === probeOrigin);
      if (matchesProbe) blockedByCsp = true;
    };
    document.addEventListener('securitypolicyviolation', onViolation);
    const waitForCspReport = () => new Promise((resolve) => setTimeout(resolve, 100));

    return fetch(probeUrl, {headers: {Accept: 'application/json'}, signal: controller.signal})
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => Boolean(body) && typeof body.packageVersion === 'string')
      .catch(() => waitForCspReport().then(() => blockedByCsp))
      .finally(() => {
        clearTimeout(timer);
        document.removeEventListener('securitypolicyviolation', onViolation);
      });
  };

  const choosePlan = () =>
    isRecovering
      ? Promise.resolve(pinnedPlan)
      : probeModuleServer().then((isAnswering) => (isAnswering ? moduleServerPlan : pinnedPlan));

  const domReady = new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve, {once: true});
    } else {
      resolve();
    }
  });

  const showNotice = (message) => {
    const notice = document.getElementById(NOTICE_ID) || document.createElement('div');
    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.textContent = 'Reload';
    reloadButton.addEventListener('click', () => location.reload());
    notice.id = NOTICE_ID;
    notice.setAttribute('role', 'alert');
    notice.setAttribute(
      'style',
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:6px;background:#fff;color:#121923;box-shadow:0 2px 12px rgba(0,0,0,.2);font:14px/1.4 system-ui,sans-serif',
    );
    notice.textContent = message;
    notice.appendChild(reloadButton);
    document.body.appendChild(notice);
  };

  const removeNotice = () => {
    const notice = document.getElementById(NOTICE_ID);
    if (notice) notice.remove();
  };

  const handleEntryError = (plan) => {
    if (plan.source === 'module-server' && markRecoveryReload()) {
      location.reload();
      return;
    }
    showNotice('Sanity Studio could not load. Check your connection and reload the page.');
  };

  // Never reloads on a stall: both maps load from the same bucket.
  const watchEntry = (entryScript, plan) => {
    const commitTime = Date.now();
    let idleTimer;

    const scheduleStallCheck = () => {
      clearTimeout(idleTimer);
      const remainingUntilCap = STALL_MAX_MS - (Date.now() - commitTime);
      const delay = Math.min(STALL_IDLE_MS, Math.max(remainingUntilCap, 0));
      idleTimer = setTimeout(() => showNotice('Sanity Studio is taking longer than usual to load.'), delay);
    };

    let progressObserver = null;
    if (typeof PerformanceObserver === 'function') {
      try {
        progressObserver = new PerformanceObserver(scheduleStallCheck);
        progressObserver.observe({buffered: false, type: 'resource'});
      } catch {
        progressObserver = null;
      }
    }
    scheduleStallCheck();

    const stopWatching = () => {
      clearTimeout(idleTimer);
      if (progressObserver) progressObserver.disconnect();
    };

    entryScript.addEventListener('load', () => {
      stopWatching();
      removeNotice();
      if (plan.source === 'pinned') {
        try {
          sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
        } catch {
          // Storage is blocked; nothing to clear.
        }
      }
    });
    entryScript.addEventListener('error', () => {
      stopWatching();
      handleEntryError(plan);
    });
  };

  const copyAttributes = (source, target) =>
    Array.from(source.attributes).forEach((attribute) => target.setAttribute(attribute.name, attribute.value));

  const startScript = (deferredScript, plan) => {
    const script = document.createElement('script');
    copyAttributes(deferredScript, script);
    // getAttribute hides the nonce once CSP applies.
    script.nonce = deferredScript.nonce;
    script.type = 'module';
    script.async = deferredScript.hasAttribute('async');
    script.textContent = deferredScript.textContent;
    if (script.hasAttribute('${ENTRY_SCRIPT_ATTRIBUTE}')) watchEntry(script, plan);
    deferredScript.replaceWith(script);
  };

  const startPreload = (deferredLink) => {
    const link = document.createElement('link');
    copyAttributes(deferredLink, link);
    link.rel = 'modulepreload';
    deferredLink.replaceWith(link);
  };

  // WebKit fails modulepreloads that follow Module Server's redirect.
  const userAgent = navigator.userAgent || '';
  const isIosDevice = /\b(iPad|iPhone|iPod)\b/.test(userAgent);
  const preloadsRedirectedModules = isIosDevice === false && /Chrom(e|ium)|Firefox/.test(userAgent);

  const commit = (plan) => {
    appendToHead(
      'script',
      {'data-sanity-module-source': plan.source, type: 'importmap'},
      JSON.stringify({imports: plan.imports}),
    );
    plan.css.forEach((href) => appendToHead('link', {href: href, rel: 'stylesheet'}));
    if (plan.imports.sanity && (plan.source === 'pinned' || preloadsRedirectedModules)) {
      appendToHead('link', {crossorigin: 'anonymous', href: plan.imports.sanity, rel: 'modulepreload'});
    }
    document
      .querySelectorAll('script[type="${DEFERRED_MODULE_SCRIPT_TYPE}"], link[rel="${DEFERRED_MODULEPRELOAD_REL}"]')
      .forEach((element) => (element.tagName === 'SCRIPT' ? startScript(element, plan) : startPreload(element)));
  };

  Promise.all([choosePlan(), domReady]).then(([plan]) => commit(plan));
}
</script>`

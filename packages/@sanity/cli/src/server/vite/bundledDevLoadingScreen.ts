/**
 * The static HTML served while Vite's experimental bundled dev mode
 * (`experimental.bundledDev`) is still producing its first bundle.
 *
 * Styled as a Win95-era BIOS/POST screen. The page must paint instantly and
 * work fully offline: everything is inlined, system fonts only, no external
 * requests. Motion is CSS-driven; the only JavaScript is a tiny inline
 * memory-counter that degrades gracefully (the final value is in the markup).
 */

interface RenderOptions {
  /**
   * Script tags lifted from Vite's own fallback page. These carry the
   * `__vite_is_fallback_page__` marker and the inlined HMR client that
   * reloads the page once the bundle is ready — they must be preserved
   * verbatim for auto-reload to keep working.
   */
  viteScripts: string

  /** Project/studio title shown in the POST readout. */
  title?: string
}

const MEMORY_KB = 65_536
/** Column where POST status values ("OK", "FOUND", ...) line up. */
const STATUS_COLUMN = 36

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Formats a POST line: a label dot-padded to a fixed column, followed by a
 * status value. Label is plain text (escaped here); status may contain markup.
 */
function postLine(label: string, statusHtml: string): string {
  const truncated =
    label.length > STATUS_COLUMN - 2 ? `${label.slice(0, STATUS_COLUMN - 3)}…` : label
  const dots = '.'.repeat(Math.max(2, STATUS_COLUMN - truncated.length))
  return `${escapeHtml(truncated)} ${dots} ${statusHtml}`
}

export function renderBundledDevLoadingScreen(options: RenderOptions): string {
  const {title, viteScripts} = options
  const productName = title || 'Sanity Studio'
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Booting ${escapeHtml(productName)}&hellip;</title>
  ${viteScripts}
  <style>
    :root {
      --bios-bg: #000;
      --bios-fg: #c8c8c8;
      --bios-bright: #fff;
      --bios-dim: #7a7a7a;
      --bios-accent: #f03e2f;
      --bios-ok: #8f8f8f;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100vh;
      background: var(--bios-bg);
      color: var(--bios-fg);
      font-family: ui-monospace, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: clamp(13px, 1.6vw, 16px);
      line-height: 1.6;
      -webkit-font-smoothing: none;
    }

    .post {
      position: relative;
      min-height: 100vh;
      padding: 2.5rem 3rem 4.5rem;
      display: flex;
      flex-direction: column;
    }

    /* CRT scanlines + vignette, one cheap overlay */
    .post::after {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 3px),
        radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.55) 100%);
    }

    .masthead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }

    .masthead h1 {
      margin: 0;
      font-size: 1em;
      font-weight: 700;
      color: var(--bios-bright);
    }

    .masthead .sub { color: var(--bios-dim); }

    .badge {
      flex: none;
      border: 2px solid var(--bios-fg);
      padding: 0.35rem 0.6rem;
      text-align: center;
      line-height: 1.25;
      color: var(--bios-bright);
    }

    .badge .s {
      display: block;
      font-size: 1.6em;
      font-weight: 700;
      color: var(--bios-accent);
    }

    .readout { margin-top: 2.2rem; }

    .line {
      white-space: pre-wrap;
      opacity: 0;
      animation: appear 1ms steps(1, end) forwards;
    }

    .ok { color: var(--bios-bright); }
    .accent { color: var(--bios-accent); }
    .dim { color: var(--bios-dim); }

    .cursor {
      display: inline-block;
      width: 0.62em;
      height: 1em;
      vertical-align: text-bottom;
      background: var(--bios-fg);
      animation: blink 1s steps(1, end) infinite;
    }

    .hintbar {
      margin-top: auto;
      padding-top: 2rem;
      color: var(--bios-dim);
    }

    .hintbar .rule {
      border: 0;
      border-top: 1px solid #333;
      margin: 0 0 0.6rem;
    }

    @keyframes appear { to { opacity: 1; } }
    @keyframes blink { 50% { opacity: 0; } }

    /* Sequential POST reveal */
    .line:nth-of-type(1)  { animation-delay: 0.15s; }
    .line:nth-of-type(2)  { animation-delay: 0.65s; }
    .line:nth-of-type(3)  { animation-delay: 1.1s; }
    .line:nth-of-type(4)  { animation-delay: 1.4s; }
    .line:nth-of-type(5)  { animation-delay: 1.65s; }
    .line:nth-of-type(6)  { animation-delay: 1.9s; }
    .line:nth-of-type(7)  { animation-delay: 2.15s; }
    .line:nth-of-type(8)  { animation-delay: 2.5s; }
    .line:nth-of-type(9)  { animation-delay: 3s; }
    .line:nth-of-type(10) { animation-delay: 3.4s; }

    @media (prefers-reduced-motion: reduce) {
      .line { animation: none; opacity: 1; }
      .cursor { animation: none; }
    }
  </style>
</head>
<body>
  <main class="post">
    <header class="masthead">
      <div>
        <h1>SANITY DEV BIOS <span class="accent">(v0.95)</span></h1>
        <div class="sub">Copyright (C) ${year} Sanity.io — Content Operating System</div>
      </div>
      <div class="badge" aria-hidden="true"><span class="s">S</span>dev<br>mode</div>
    </header>

    <section class="readout" aria-live="polite">
      <div class="line">Main Processor : Vite (full-bundle mode)</div>
      <div class="line">Memory Test    : <span id="memcount">${MEMORY_KB}</span>K <span class="ok">OK</span></div>
      <div class="line">&nbsp;</div>
      <div class="line">${postLine('Detecting Content Lake', '<span class="ok">ONLINE</span>')}</div>
      <div class="line">${postLine(`Mounting ${productName}`, '<span class="ok">OK</span>')}</div>
      <div class="line">${postLine('Checking schema types', '<span class="ok">FOUND</span>')}</div>
      <div class="line">&nbsp;</div>
      <div class="line ok">Bundling JavaScript modules ... <span class="cursor"></span></div>
      <div class="line">&nbsp;</div>
      <div class="line dim">The page will reload automatically when the bundle is ready.</div>
    </section>

    <footer class="hintbar">
      <hr class="rule">
      <div>Press &lt;DEL&gt; to enter SETUP &nbsp;&middot;&nbsp; Press nothing to continue: the bundler does not take requests</div>
    </footer>
  </main>

  <script>
    (function () {
      var el = document.getElementById('memcount')
      if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      var total = ${MEMORY_KB}
      var current = 0
      el.textContent = '0'
      // Starts when the "Memory Test" line is revealed (see .line delays).
      setTimeout(function () {
        var timer = setInterval(function () {
          current = Math.min(total, current + 4096)
          el.textContent = String(current)
          if (current === total) clearInterval(timer)
        }, 50)
      }, 650)
    })()
  </script>
</body>
</html>
`
}

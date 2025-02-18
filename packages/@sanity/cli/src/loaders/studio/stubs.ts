import {JSDOM} from 'jsdom'

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body></body>
</html>`

const dom = new JSDOM(html, {
  pretendToBeVisual: true,
  url: 'http://localhost:3333/',
})

// Special handling of certain globals
if (typeof dom.window.document.execCommand !== 'function') {
  // Crashes ace editor without this :/
  dom.window.document.execCommand = function execCommand(
    // Provide the right arity for the function, even if unused
    _commandName: string,
    _showDefaultUI: boolean,
    _valueArgument: unknown,
  ) {
    // Return false to indicate "unsupported"
    return false
  }
}

if (dom.window.requestIdleCallback === undefined) {
  dom.window.requestIdleCallback = (cb: IdleRequestCallback) => setTimeout(cb, 10)
}

if (dom.window.cancelIdleCallback === undefined) {
  dom.window.cancelIdleCallback = (id: number) => clearTimeout(id)
}

if (dom.window.ResizeObserver === undefined) {
  dom.window.ResizeObserver = class ResizeObserver {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_callback: unknown) {}
    disconnect() {}
    observe(_target: unknown, _options: unknown) {}
    unobserve(_target: unknown) {}
  }
}

if (dom.window.IntersectionObserver === undefined) {
  dom.window.IntersectionObserver = class IntersectionObserver {
    options: {root?: unknown; rootMargin?: string; threshold?: number}
    constructor(
      _callback: unknown,
      options?: {root?: unknown; rootMargin?: string; threshold?: number},
    ) {
      this.options = options || {}
    }
    get root() {
      return this.options.root || null
    }
    get rootMargin() {
      return this.options.rootMargin || ''
    }
    get thresholds() {
      return Array.isArray(this.options.threshold)
        ? this.options.threshold
        : [this.options.threshold || 0]
    }

    disconnect() {}
    observe(_el: unknown) {}
    takeRecords() {
      return []
    }
    unobserve(_el: unknown) {}
  }
}

if (dom.window.matchMedia === undefined) {
  dom.window.matchMedia = (_qs: unknown) =>
    ({
      matches: false,
      media: '',
      onchange: null,
    }) as any
}

// Generic jsdom 1:1
export const alert = dom.window.alert
export const atob = dom.window.atob
export const blur = dom.window.blur
export const btoa = dom.window.btoa
export const cancelAnimationFrame = dom.window.cancelAnimationFrame
export const captureEvents = dom.window.captureEvents
export const clearInterval = dom.window.clearInterval
export const clearTimeout = dom.window.clearTimeout
export const close = dom.window.close
export const confirm = dom.window.confirm
export const console = dom.window.console
export const crypto = dom.window.crypto
export const CSSImportRule = dom.window.CSSImportRule
export const CSSMediaRule = dom.window.CSSMediaRule
export const CSSRule = dom.window.CSSRule
export const CSSStyleDeclaration = dom.window.CSSStyleDeclaration
export const CSSStyleRule = dom.window.CSSStyleRule
export const CSSStyleSheet = dom.window.CSSStyleSheet
export const customElements = dom.window.customElements
export const devicePixelRatio = dom.window.devicePixelRatio
export const document = dom.window.document
export const event = dom.window.event
export const external = dom.window.external
export const focus = dom.window.focus
export const frameElement = dom.window.frameElement
export const frames = dom.window.frames
export const getComputedStyle = dom.window.getComputedStyle
export const getSelection = dom.window.getSelection
export const history = dom.window.history
export const innerHeight = dom.window.innerHeight
export const innerWidth = dom.window.innerWidth
export const length = dom.window.length
export const localStorage = dom.window.localStorage
export const location = dom.window.location
export const locationbar = dom.window.locationbar
export const MediaList = dom.window.MediaList
export const menubar = dom.window.menubar
export const moveBy = dom.window.moveBy
export const moveTo = dom.window.moveTo
export const name = dom.window.name
export const navigator = dom.window.navigator
export const onabort = dom.window.onabort
export const onafterprint = dom.window.onafterprint
export const onautocomplete = dom.window.onautocomplete
export const onautocompleteerror = dom.window.onautocompleteerror
export const onauxclick = dom.window.onauxclick
export const onbeforeinput = dom.window.onbeforeinput
export const onbeforematch = dom.window.onbeforematch
export const onbeforeprint = dom.window.onbeforeprint
export const onbeforetoggle = dom.window.onbeforetoggle
export const onbeforeunload = dom.window.onbeforeunload
export const onblur = dom.window.onblur
export const oncancel = dom.window.oncancel
export const oncanplay = dom.window.oncanplay
export const oncanplaythrough = dom.window.oncanplaythrough
export const onchange = dom.window.onchange
export const onclick = dom.window.onclick
export const onclose = dom.window.onclose
export const oncontextlost = dom.window.oncontextlost
export const oncontextmenu = dom.window.oncontextmenu
export const oncontextrestored = dom.window.oncontextrestored
export const oncopy = dom.window.oncopy
export const oncuechange = dom.window.oncuechange
export const oncut = dom.window.oncut
export const ondblclick = dom.window.ondblclick
export const ondrag = dom.window.ondrag
export const ondragend = dom.window.ondragend
export const ondragenter = dom.window.ondragenter
export const ondragleave = dom.window.ondragleave
export const ondragover = dom.window.ondragover
export const ondragstart = dom.window.ondragstart
export const ondrop = dom.window.ondrop
export const ondurationchange = dom.window.ondurationchange
export const onemptied = dom.window.onemptied
export const onended = dom.window.onended
export const onerror = dom.window.onerror
export const onfocus = dom.window.onfocus
export const onformdata = dom.window.onformdata
export const onhashchange = dom.window.onhashchange
export const oninput = dom.window.oninput
export const oninvalid = dom.window.oninvalid
export const onkeydown = dom.window.onkeydown
export const onkeypress = dom.window.onkeypress
export const onkeyup = dom.window.onkeyup
export const onlanguagechange = dom.window.onlanguagechange
export const onload = dom.window.onload
export const onloadeddata = dom.window.onloadeddata
export const onloadedmetadata = dom.window.onloadedmetadata
export const onloadstart = dom.window.onloadstart
export const onmessage = dom.window.onmessage
export const onmessageerror = dom.window.onmessageerror
export const onmousedown = dom.window.onmousedown
export const onmouseenter = dom.window.onmouseenter
export const onmouseleave = dom.window.onmouseleave
export const onmousemove = dom.window.onmousemove
export const onmouseout = dom.window.onmouseout
export const onmouseover = dom.window.onmouseover
export const onmouseup = dom.window.onmouseup
export const onoffline = dom.window.onoffline
export const ononline = dom.window.ononline
export const onpagehide = dom.window.onpagehide
export const onpageshow = dom.window.onpageshow
export const onpaste = dom.window.onpaste
export const onpause = dom.window.onpause
export const onplay = dom.window.onplay
export const onplaying = dom.window.onplaying
export const onpopstate = dom.window.onpopstate
export const onprogress = dom.window.onprogress
export const onratechange = dom.window.onratechange
export const onrejectionhandled = dom.window.onrejectionhandled
export const onreset = dom.window.onreset
export const onresize = dom.window.onresize
export const onscroll = dom.window.onscroll
export const onscrollend = dom.window.onscrollend
export const onsecuritypolicyviolation = dom.window.onsecuritypolicyviolation
export const onseeked = dom.window.onseeked
export const onseeking = dom.window.onseeking
export const onselect = dom.window.onselect
export const onslotchange = dom.window.onslotchange
export const onsort = dom.window.onsort
export const onstalled = dom.window.onstalled
export const onstorage = dom.window.onstorage
export const onsubmit = dom.window.onsubmit
export const onsuspend = dom.window.onsuspend
export const ontimeupdate = dom.window.ontimeupdate
export const ontoggle = dom.window.ontoggle
export const ontouchcancel = dom.window.ontouchcancel
export const ontouchend = dom.window.ontouchend
export const ontouchmove = dom.window.ontouchmove
export const ontouchstart = dom.window.ontouchstart
export const onunhandledrejection = dom.window.onunhandledrejection
export const onunload = dom.window.onunload
export const onvolumechange = dom.window.onvolumechange
export const onwaiting = dom.window.onwaiting
export const onwebkitanimationend = dom.window.onwebkitanimationend
export const onwebkitanimationiteration = dom.window.onwebkitanimationiteration
export const onwebkitanimationstart = dom.window.onwebkitanimationstart
export const onwebkittransitionend = dom.window.onwebkittransitionend
export const onwheel = dom.window.onwheel
export const open = dom.window.open
export const origin = dom.window.origin
export const outerHeight = dom.window.outerHeight
export const outerWidth = dom.window.outerWidth
export const pageXOffset = dom.window.pageXOffset
export const pageYOffset = dom.window.pageYOffset
export const parent = dom.window.parent
export const performance = dom.window.performance
export const personalbar = dom.window.personalbar
export const postMessage = dom.window.postMessage
export const print = dom.window.print
export const prompt = dom.window.prompt
export const queueMicrotask = dom.window.queueMicrotask
export const releaseEvents = dom.window.releaseEvents
export const requestAnimationFrame = dom.window.requestAnimationFrame
export const resizeBy = dom.window.resizeBy
export const resizeTo = dom.window.resizeTo
export const screen = dom.window.screen
export const screenLeft = dom.window.screenLeft
export const screenTop = dom.window.screenTop
export const screenX = dom.window.screenX
export const screenY = dom.window.screenY
export const scroll = dom.window.scroll
export const scrollbars = dom.window.scrollbars
export const scrollBy = dom.window.scrollBy
export const scrollTo = dom.window.scrollTo
export const scrollX = dom.window.scrollX
export const scrollY = dom.window.scrollY
export const self = dom.window.self
export const sessionStorage = dom.window.sessionStorage
export const setInterval = dom.window.setInterval
export const setTimeout = dom.window.setTimeout
export const status = dom.window.status
export const statusbar = dom.window.statusbar
export const stop = dom.window.stop
export const StyleSheet = dom.window.StyleSheet
export const toolbar = dom.window.toolbar
export const top = dom.window.top
export const window = dom.window
export const XPathEvaluator = dom.window.XPathEvaluator
export const XPathException = dom.window.XPathException
export const XPathExpression = dom.window.XPathExpression
export const XPathResult = dom.window.XPathResult

// Extended properties
export const requestIdleCallback = dom.window.requestIdleCallback
export const cancelIdleCallback = dom.window.cancelIdleCallback
export const ResizeObserver = dom.window.ResizeObserver
export const IntersectionObserver = dom.window.IntersectionObserver
export const matchMedia = dom.window.matchMedia

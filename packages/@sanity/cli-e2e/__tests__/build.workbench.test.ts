import {type Browser, chromium, type Page} from 'playwright'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test} from 'vitest'

import {buildApp, buildHost, type BuiltApp} from '../helpers/federatedApps.js'

const reactProviders = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']
const allProviders = [...reactProviders, 'styled-components']

// Dependency sharing has not shipped to the registry CLI used by scheduled E2E runs.
describe.skipIf(process.env.E2E_REGISTRY_MODE === 'true')('built app dependency sharing', () => {
  const apps: Record<string, BuiltApp> = {}
  let browser: Browser
  let page: Page
  let errors: string[]
  let requests: Set<string>

  beforeAll(async () => {
    apps.first = await buildApp('first')
    apps.second = await buildApp('second', {customConfig: true})
    apps.withoutStyled = await buildApp('without-styled', {styled: false})
    apps.otherStyled = await buildApp('other-styled', {
      versionOverrides: {'styled-components': '6.0.0'},
    })
    apps.otherScheduler = await buildApp('other-scheduler', {
      styled: false,
      versionOverrides: {scheduler: '0.0.1'},
    })
    await buildHost(Object.values(apps))
    browser = await chromium.launch()
  }, 180_000)

  afterAll(async () => {
    await Promise.all([browser?.close(), ...Object.values(apps).map((app) => app.close())])
  })

  beforeEach(async () => {
    page = await browser.newPage()
    errors = []
    requests = new Set()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => requests.add(request.url()))
    await page.goto(apps.first.url)
  })

  afterEach(async () => {
    await page?.close()
    expect(errors).toEqual([])
  })

  async function mount(app: BuiltApp, color?: string) {
    // A string keeps Vitest from rewriting the browser's dynamic import to an SSR helper.
    await page.evaluate(
      `import('/host.js').then(host => host.mount(${JSON.stringify(app.name)}, ${JSON.stringify(color)}))`,
    )
    await page.locator(`#${app.name}`).getByText(/Hello/).waitFor()
  }

  function requestedProviders(app: BuiltApp, names = allProviders) {
    return names.filter((name) => {
      const provider = app.manifest.shared.find((provider) => provider.name === name)
      const assets = provider ? [...provider.assets.js.sync, ...provider.assets.js.async] : []
      // Missing assets must fail the check rather than masquerade as successful reuse.
      if (assets.length === 0) throw new Error(`${app.name}: no provider assets for ${name}`)
      return assets.some((asset) => requests.has(new URL(asset, app.url).href))
    })
  }

  test('reuses providers after preload, including for an app without styled-components', async () => {
    const {first, second, withoutStyled} = apps
    await mount(first)
    expect(requestedProviders(first)).toEqual(allProviders)

    await page.evaluate("import('/host.js').then(host => host.preload('second'))")
    await mount(second)
    expect(requestedProviders(second)).toEqual([])

    await mount(withoutStyled)
    expect(requestedProviders(withoutStyled, reactProviders)).toEqual([])
  })

  test('keeps state and styles independent when sharing dependencies', async () => {
    await mount(apps.first, 'rgb(0, 128, 0)')
    await mount(apps.second, 'rgb(0, 0, 255)')
    expect(requestedProviders(apps.second)).toEqual([])

    await page.locator('#first button').click()
    await page.locator('#first').getByRole('button', {name: 'Hello 1'}).waitFor()
    expect(await page.locator('#second button').textContent()).toBe('Hello 0')
    expect(
      await page.locator('#first').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(0, 128, 0)')

    await page.evaluate("import('/host.js').then(host => host.unmount('first'))")
    await page.locator('#first button').waitFor({state: 'detached'})
    expect(
      await page.locator('#second').evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        button: getComputedStyle(el.querySelector('button')!).color,
      })),
    ).toEqual({background: 'rgb(0, 0, 255)', button: 'rgb(255, 0, 0)'})
    await page.locator('#second button').click()
    await page.locator('#second').getByRole('button', {name: 'Hello 1'}).waitFor()
  })

  test('loads only the providers whose versions are incompatible', async () => {
    await mount(apps.first)
    await mount(apps.otherStyled)
    expect(requestedProviders(apps.otherStyled)).toEqual(['styled-components'])

    await mount(apps.otherScheduler)
    expect(requestedProviders(apps.otherScheduler, reactProviders)).toEqual(reactProviders)
  })
})

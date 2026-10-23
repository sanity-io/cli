import {describe, expect, test} from 'vitest'

import {getEntryModule} from '../getEntryModule'

describe('getEntryModule', () => {
  test('emits reactStrictMode: undefined when the option is undefined, deferring to the studio default', () => {
    const output = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: undefined')
  })

  test('emits reactStrictMode: undefined for the no-config template too', () => {
    const output = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(output).toContain('reactStrictMode: undefined')
    expect(output).toContain('missingConfigFile: true')
  })

  test('emits a concrete reactStrictMode: true when explicitly enabled', () => {
    const output = getEntryModule({
      reactStrictMode: true,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: true')
  })

  test('emits a concrete reactStrictMode: false when explicitly disabled', () => {
    const output = getEntryModule({
      reactStrictMode: false,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain('reactStrictMode: false')
  })

  test('never references reactStrictMode for the app entry module', () => {
    const output = getEntryModule({
      entry: './src/App',
      isApp: true,
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(output).not.toContain('reactStrictMode')
    expect(output).toContain('createRoot')
  })

  test('emits the no-app-view stub for an app without an entry', () => {
    const output = getEntryModule({
      isApp: true,
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(output).not.toContain('reactStrictMode')
    expect(output).not.toContain('createRoot')
    expect(output).toContain('This application has no app view.')
  })

  test('omits the resource-bindings import when not a Blueprints build', () => {
    const studio = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: './sanity.config',
    })
    const app = getEntryModule({
      entry: './src/App',
      isApp: true,
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    expect(studio).not.toContain('sanity-resource-bindings')
    expect(app).not.toContain('sanity-resource-bindings')
  })

  test('imports the resource-bindings module first on a Blueprints build', () => {
    const output = getEntryModule({
      isBlueprints: true,
      reactStrictMode: undefined,
      relativeConfigLocation: './sanity.config',
    })

    expect(output).toContain("import './sanity-resource-bindings.js'")
    // It must precede the app imports so bindings evaluate first.
    expect(output.indexOf('sanity-resource-bindings.js')).toBeLessThan(
      output.indexOf('import studioConfig from "./sanity.config"'),
    )
  })

  // `react-dom` reads the DevTools hook once at module init, so a side-effect
  // import at the top of the user module only runs first if that module is the
  // entry's first import.
  test('imports the studio config before sanity', () => {
    const output = getEntryModule({
      reactStrictMode: undefined,
      relativeConfigLocation: './sanity.config',
    })

    const configImport = output.indexOf('import studioConfig from "./sanity.config"')
    const sanityImport = output.indexOf('import {renderStudio} from "sanity"')
    expect(configImport).toBeGreaterThanOrEqual(0)
    expect(configImport).toBeLessThan(sanityImport)
  })

  test('imports the user App before react-dom and react', () => {
    const output = getEntryModule({
      entry: './src/App',
      isApp: true,
      reactStrictMode: undefined,
      relativeConfigLocation: null,
    })

    const appImport = output.indexOf('import App from "./src/App"')
    expect(appImport).toBeGreaterThanOrEqual(0)
    expect(appImport).toBeLessThan(output.indexOf("import {createRoot} from 'react-dom/client'"))
    expect(appImport).toBeLessThan(output.indexOf("import {createElement} from 'react'"))
  })
})

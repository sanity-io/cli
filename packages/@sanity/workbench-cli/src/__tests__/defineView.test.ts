import {describe, expect, expectTypeOf, test} from 'vitest'

import {VIEW_CONTRACT_VERSION} from '../contract.js'
import {type DefinedView, type PanelViewProps, unstable_defineView} from '../defineView.js'

const title = ({view}: PanelViewProps) => view.name
const panel = ({view}: PanelViewProps) => view.name

describe('unstable_defineView', () => {
  test('returns the view type, contract version, and the author components', () => {
    const view = unstable_defineView('panel', {panel, title})

    expect(view.type).toBe('panel')
    expect(view.version).toBe(VIEW_CONTRACT_VERSION)
    // Components pass through by reference — the helper is pure identity.
    expect(view.components.title).toBe(title)
    expect(view.components.panel).toBe(panel)
  })
})

describe('type surface', () => {
  test('narrows the component record from the view type argument', () => {
    const view = unstable_defineView('panel', {panel: () => null, title: () => null})

    expectTypeOf(view).toEqualTypeOf<DefinedView<'panel'>>()
    expectTypeOf(view.components).toHaveProperty('title')
    expectTypeOf(view.components).toHaveProperty('panel')
  })

  test('passes each panel component the local panel record as props', () => {
    unstable_defineView('panel', {
      panel: (props) => {
        expectTypeOf(props).toEqualTypeOf<PanelViewProps>()
        return null
      },
      title: (props) => {
        expectTypeOf(props).toEqualTypeOf<PanelViewProps>()
        expectTypeOf(props.view).toEqualTypeOf<{
          name: string
          src: string
          title: string
          type: 'panel'
        }>()
        return null
      },
    })
  })

  test('rejects an unknown view type', () => {
    // @ts-expect-error — "sidebar" is not a known view type.
    unstable_defineView('sidebar', {panel: () => null, title: () => null})
  })
})

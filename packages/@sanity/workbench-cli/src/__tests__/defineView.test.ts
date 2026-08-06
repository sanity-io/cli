import {type AssetSourceComponentProps} from '@sanity/types'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {type TileSize, VIEW_CONTRACT_VERSION} from '../contract.js'
import {
  type DefinedView,
  type PanelViewProps,
  type TileViewProps,
  unstable_defineView,
} from '../defineView.js'

const title = ({view}: PanelViewProps) => view.name
const panel = ({view}: PanelViewProps) => view.name
const assetSource = (props: AssetSourceComponentProps) => props.assetSource.name
const tile = ({view}: TileViewProps) => view.size

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

describe('asset_source view', () => {
  test('returns the view type, contract version, and the author component', () => {
    const view = unstable_defineView('asset_source', {asset_source: assetSource})

    expect(view.type).toBe('asset_source')
    expect(view.version).toBe(VIEW_CONTRACT_VERSION)
    expect(view.components.asset_source).toBe(assetSource)
  })

  test('narrows the component record and props from the view type argument', () => {
    const view = unstable_defineView('asset_source', {
      asset_source: (props) => {
        expectTypeOf(props).toEqualTypeOf<AssetSourceComponentProps>()
        return null
      },
    })

    expectTypeOf(view).toEqualTypeOf<DefinedView<'asset_source'>>()
    expectTypeOf(view.components).toHaveProperty('asset_source')
  })

  test('rejects a panel component record for an asset_source view', () => {
    // @ts-expect-error — asset_source exposes only the `asset_source` slot.
    unstable_defineView('asset_source', {panel: () => null, title: () => null})
  })
})

describe('tile view', () => {
  test('returns the view type, contract version, and the author component', () => {
    const view = unstable_defineView('tile', {tile})

    expect(view.type).toBe('tile')
    expect(view.version).toBe(VIEW_CONTRACT_VERSION)
    expect(view.components.tile).toBe(tile)
  })

  test('narrows the component record and props (incl. footprint size) from the view type argument', () => {
    const view = unstable_defineView('tile', {
      tile: (props) => {
        expectTypeOf(props).toEqualTypeOf<TileViewProps>()
        expectTypeOf(props.view).toEqualTypeOf<{
          name: string
          size: TileSize
          src: string
          title: string
          type: 'tile'
        }>()
        return null
      },
    })

    expectTypeOf(view).toEqualTypeOf<DefinedView<'tile'>>()
    expectTypeOf(view.components).toHaveProperty('tile')
  })

  test('rejects a panel component record for a tile view', () => {
    // @ts-expect-error — tile exposes only the `tile` slot.
    unstable_defineView('tile', {panel: () => null, title: () => null})
  })
})

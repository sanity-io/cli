import jscodeshift from 'jscodeshift'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import transform, {parser} from '../../../../codemods/dashboardViewsV1.js'

const report = vi.fn()
const VIEW = 'import { unstable_defineView } from "sanity/dashboard";\n'

function migrate(source: string, path = 'src/view.tsx', options = {}) {
  const j = jscodeshift.withParser(parser)

  return transform({path, source}, {j, jscodeshift: j, report, stats: () => {}}, options)
}

describe('dashboard-views-v1 transform', () => {
  beforeEach(() => report.mockClear())

  test('exports a tile without props as a named component and keeps the header comment', () => {
    expect(
      migrate(`// Notifications tile
import { unstable_defineView } from "sanity/workbench";

import { AppShell } from "../AppShell";

export default unstable_defineView("tile", {
  tile: () => (
    <AppShell>
      <NotificationsWidget />
    </AppShell>
  ),
});`),
    ).toMatchInlineSnapshot(`
      "// Notifications tile
      import { AppShell } from "../AppShell";

      export default function Tile() {
        return (
          <AppShell>
            <NotificationsWidget />
          </AppShell>
        );
      }"
    `)
  })

  test('reads tile props with useTile and keeps the function name', () => {
    expect(
      migrate(`import { Tile } from "./Tile";
import { unstable_defineView } from "sanity/dashboard";

export default unstable_defineView("tile", {
  tile: function OverviewTile(props) {
    return <Tile title={props.view.title} size={props.view.size} />;
  },
});`),
    ).toMatchInlineSnapshot(`
      "import { Tile } from "./Tile";
      import { useTile } from "@sanity/sdk-react/dashboard";

      export default function OverviewTile() {
        const props = useTile();
        return <Tile title={props.view.title} size={props.view.size} />;
      }"
    `)
  })

  test('renames a named tile function whose name the module already declares', () => {
    expect(
      migrate(`${VIEW}import { OverviewTile } from "./OverviewTile";

export const preview = <OverviewTile />;

export default unstable_defineView("tile", {
  tile: function OverviewTile() {
    return null;
  },
});`),
    ).toContain('export default function Tile()')
  })

  test('reads asset source props with useAssetSource and avoids a taken name', () => {
    expect(
      migrate(`import { Button } from "@sanity/ui";
import { unstable_defineView } from "sanity/dashboard";

import { AssetSource } from "./AssetSource";

export default unstable_defineView("asset_source", {
  asset_source: ({ assetSource, onClose }) => (
    <AssetSource name={assetSource.name} onClose={onClose} />
  ),
});`),
    ).toMatchInlineSnapshot(`
      "import { Button } from "@sanity/ui";
      import { AssetSource } from "./AssetSource";

      import { useAssetSource } from "@sanity/sdk-react/dashboard";

      export default function AssetSource2() {
        const { assetSource, onClose } = useAssetSource();
        return (<AssetSource name={assetSource.name} onClose={onClose} />);
      }"
    `)
  })

  test('renames the service prop to worker and types the props', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

/** Checks for drop updates. */
export default unstable_defineService("worker", ({ bus, service }) => {
  const interval = setInterval(() => bus.emit("tick", service.name), 1_000);

  return () => clearInterval(interval);
});`,
        'src/worker.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import type { WebWorkerProps } from "@sanity/sdk-react/dashboard";

      /** Checks for drop updates. */
      export default ({
        bus,
        worker: service
      }: WebWorkerProps) => {
        const interval = setInterval(() => bus.emit("tick", service.name), 1_000);

        return () => clearInterval(interval);
      };"
    `)
  })

  test('renames service in a web worker with defaulted props', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";
export default unstable_defineService("worker", ({ service } = defaults) => service.name);`,
        'src/worker.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import type { WebWorkerProps } from "@sanity/sdk-react/dashboard";
      export default ({
        worker: service
      }: WebWorkerProps = defaults) => service.name;"
    `)
  })

  test('imports the web worker props type from the SDK package that prepare picked', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";
export default unstable_defineService("worker", ({ bus }) => {});`,
        'src/worker.ts',
        {sdkPackage: '@sanity/sdk'},
      ),
    ).toContain('import type { WebWorkerProps } from "@sanity/sdk/dashboard";')
  })

  test('renames service on a props object and leaves a JavaScript web worker untyped', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

export default unstable_defineService("worker", function run(props) {
  console.log(props.service.name, props.bus);
});`,
        'src/worker.js',
      ),
    ).toMatchInlineSnapshot(`
      "export default function run(props) {
        console.log(props.worker.name, props.bus);
      };"
    `)
  })

  test.each([
    [
      'a panel view',
      `${VIEW}export default unstable_defineView("panel", { panel: () => null });`,
      'only tile and asset_source views with an inline component are migrated',
    ],
    [
      'an imported tile component',
      `${VIEW}export default unstable_defineView("tile", { tile: Tile });`,
      'only tile and asset_source views with an inline component are migrated',
    ],
    [
      'a view that is not the default export',
      `${VIEW}export const tile = unstable_defineView("tile", { tile: () => null });`,
      'only `export default unstable_defineView(...)` is migrated',
    ],
    [
      'a web worker function declared elsewhere',
      `import { unstable_defineService } from "sanity/dashboard";\nexport default unstable_defineService("worker", run);`,
      'only an inline function is migrated',
    ],
  ])('leaves %s unchanged and reports it', (_, code, message) => {
    expect(migrate(code)).toBe(undefined)
    expect(report).toHaveBeenCalledWith(expect.stringContaining(message))
  })

  test('leaves files without v1 views or web workers unchanged', () => {
    expect(migrate(`export default function Tile() {\n  return null;\n}`)).toBe(undefined)
    expect(report).not.toHaveBeenCalled()
  })
})

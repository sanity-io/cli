import {applyTransform} from 'jscodeshift/src/testUtils.js'
import {describe, expect, test} from 'vitest'

import * as transform from '../../../../codemods/dashboardViewsV1.js'

function migrate(source: string, path = 'src/view.tsx') {
  return applyTransform(transform, {}, {path, source})
}

describe('dashboard-views-v1 transform', () => {
  test('merges a panel title and body into one component with a close button', () => {
    expect(
      migrate(`import { unstable_defineView } from "sanity/dashboard";

import { PanelBody } from "./shell/PanelBody";
import { PanelProvider } from "./shell/PanelProvider";
import { PanelTitle } from "./shell/PanelTitle";

export default unstable_defineView("panel", {
  title: () => (
    <PanelProvider>
      <PanelTitle />
    </PanelProvider>
  ),
  panel: () => (
    <PanelProvider>
      <PanelBody />
    </PanelProvider>
  ),
});`),
    ).toMatchInlineSnapshot(`
      "import { usePanel } from "sanity/dashboard";

      import { PanelBody } from "./shell/PanelBody";
      import { PanelProvider } from "./shell/PanelProvider";
      import { PanelTitle } from "./shell/PanelTitle";

      import { Box, Button, Flex, ThemeProvider, usePrefersDark } from "@sanity/ui";
      import { buildTheme } from "@sanity/ui/theme";
      import { CloseIcon } from "@sanity/icons";
      const theme = buildTheme();

      export default function Panel() {
        const { onClose } = usePanel();
        const prefersDark = usePrefersDark();

        return (
          <ThemeProvider scheme={prefersDark ? "dark" : "light"} theme={theme}>
            <Flex direction="column" height="fill" paddingY={2}>
              <Flex align="center" gap={2} justify="space-between" paddingX={3} paddingY={2}>
                <PanelProvider>
                  <PanelTitle />
                </PanelProvider>
                <Button
                  aria-label="Close panel"
                  fontSize={1}
                  icon={CloseIcon}
                  mode="bleed"
                  onClick={onClose}
                  padding={2}
                />
              </Flex>
              <Box flex={1} overflow="auto" paddingX={3}>
                <PanelProvider>
                  <PanelBody />
                </PanelProvider>
              </Box>
            </Flex>
          </ThemeProvider>
        );
      }"
    `)
  })

  test('reads panel props with usePanel and leaves an imported component for the author to migrate', () => {
    expect(
      migrate(`import { Text } from "@sanity/ui";
import { unstable_defineView } from "sanity/workbench";

import { NotificationsPanel } from "../notifications/NotificationsPanel";

export default unstable_defineView("panel", {
  panel: NotificationsPanel,
  title: ({ view }) => <Text size={2}>{view.title}</Text>,
});`),
    ).toMatchInlineSnapshot(`
      "import { Text, Box, Button, Flex, ThemeProvider, usePrefersDark } from "@sanity/ui";

      import { NotificationsPanel } from "../notifications/NotificationsPanel";

      import { buildTheme } from "@sanity/ui/theme";
      import { CloseIcon } from "@sanity/icons";
      import { usePanel } from "sanity/dashboard";
      const theme = buildTheme();

      export default function Panel() {
        const { onClose, view } = usePanel();
        const prefersDark = usePrefersDark();

        return (
          <ThemeProvider scheme={prefersDark ? "dark" : "light"} theme={theme}>
            <Flex direction="column" height="fill" paddingY={2}>
              <Flex align="center" gap={2} justify="space-between" paddingX={3} paddingY={2}>
                <Text size={2}>{view.title}</Text>
                <Button
                  aria-label="Close panel"
                  fontSize={1}
                  icon={CloseIcon}
                  mode="bleed"
                  onClick={onClose}
                  padding={2}
                />
              </Flex>
              <Box flex={1} overflow="auto" paddingX={3}>
                <NotificationsPanel />
              </Box>
            </Flex>
          </ThemeProvider>
        );
      }"
    `)
  })

  test('aliases a panel UI component the file already imports and hoists a title it cannot inline', () => {
    expect(
      migrate(`import { unstable_defineView } from "sanity/dashboard";
import { Box } from "ui5";

export default unstable_defineView("panel", {
  panel: () => <Box>Body</Box>,
  title: () => {
    const label = "Title";
    return <Box>{label}</Box>;
  },
});`),
    ).toMatchInlineSnapshot(`
      "import { usePanel } from "sanity/dashboard";
      import { Box } from "ui5";

      import { Box as Box2, Button, Flex, ThemeProvider, usePrefersDark } from "@sanity/ui";
      import { buildTheme } from "@sanity/ui/theme";
      import { CloseIcon } from "@sanity/icons";

      const Title = () => {
        const label = "Title";
        return <Box>{label}</Box>;
      };

      const theme = buildTheme();

      export default function Panel() {
        const { onClose } = usePanel();
        const prefersDark = usePrefersDark();

        return (
          <ThemeProvider scheme={prefersDark ? "dark" : "light"} theme={theme}>
            <Flex direction="column" height="fill" paddingY={2}>
              <Flex align="center" gap={2} justify="space-between" paddingX={3} paddingY={2}>
                <Title />
                <Button
                  aria-label="Close panel"
                  fontSize={1}
                  icon={CloseIcon}
                  mode="bleed"
                  onClick={onClose}
                  padding={2}
                />
              </Flex>
              <Box2 flex={1} overflow="auto" paddingX={3}>
                <Box>Body</Box>
              </Box2>
            </Flex>
          </ThemeProvider>
        );
      }"
    `)
  })

  test('exports a tile component directly and keeps the file header comment', () => {
    expect(
      migrate(`// Notifications tile.
import { unstable_defineView } from "sanity/workbench";

import { AppShell } from "../AppShell";
import { NotificationsWidget } from "../notifications/NotificationsWidget";

export default unstable_defineView("tile", {
  tile: () => (
    <AppShell>
      <NotificationsWidget />
    </AppShell>
  ),
});`),
    ).toMatchInlineSnapshot(`
      "// Notifications tile.
      import { AppShell } from "../AppShell";
      import { NotificationsWidget } from "../notifications/NotificationsWidget";

      const Tile = () => (
        <AppShell>
          <NotificationsWidget />
        </AppShell>
      );

      export default Tile;"
    `)
  })

  test('turns a named tile function into a declaration that keeps the comment above the export', () => {
    expect(
      migrate(`import { unstable_defineView } from "sanity/dashboard";

// Renders the overview.
export default unstable_defineView("tile", {
  tile: function OverviewTile({ view }) {
    return <Overview title={view.title} />;
  },
});`),
    ).toMatchInlineSnapshot(`
      "import { useTile } from "sanity/dashboard";

      // Renders the overview.
      function OverviewTile() {
        const { view } = useTile();
        return <Overview title={view.title} />;
      }

      export default OverviewTile;"
    `)
  })

  test('reads tile props with useTile', () => {
    expect(
      migrate(`import { unstable_defineView } from "sanity/dashboard";

function OverviewTile(props: TileViewProps) {
  return <Tile title={props.view.title} />;
}

export default unstable_defineView("tile", { tile: OverviewTile });`),
    ).toMatchInlineSnapshot(`
      "import { useTile } from "sanity/dashboard";

      function OverviewTile() {
        const props = useTile();
        return <Tile title={props.view.title} />;
      }

      export default OverviewTile;"
    `)
  })

  test('drops tile props it never reads instead of calling useTile', () => {
    expect(
      migrate(`import { unstable_defineView } from "sanity/dashboard";

export default unstable_defineView("tile", {
  tile: (props: TileViewProps) => <Greeting />,
});`),
    ).toMatchInlineSnapshot(`
      "const Tile = () => <Greeting />;

      export default Tile;"
    `)
  })

  test('reads asset source props with useAssetSource', () => {
    expect(
      migrate(`import { Button } from "@sanity/ui";
import { unstable_defineView } from "sanity/dashboard";

export default unstable_defineView("asset_source", {
  asset_source: (props) => <Button text={props.assetSource.name} onClick={() => props.onClose()} />,
});`),
    ).toMatchInlineSnapshot(`
      "import { Button } from "@sanity/ui";
      import { useAssetSource } from "sanity/dashboard";

      const AssetSource = () => {
        const props = useAssetSource();
        return <Button text={props.assetSource.name} onClick={() => props.onClose()} />;
      };

      export default AssetSource;"
    `)
  })

  test('exports a web worker function, renames service to worker and types its props', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

/**
 * A background worker for Drop Desk.
 */
export default unstable_defineService("worker", ({ service }) => {
  const interval = setInterval(() => {
    console.warn(\`Drop Desk worker "\${service.name}" checked for drop updates\`);
  }, 1_000);

  return () => {
    clearInterval(interval);
    console.warn(\`Drop Desk worker "\${service.name}" stopped\`);
  };
});`,
        'src/service.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import type { WebWorkerProps } from "sanity/dashboard";

      /**
       * A background worker for Drop Desk.
       */
      export default ({
        worker
      }: WebWorkerProps) => {
        const interval = setInterval(() => {
          console.warn(\`Drop Desk worker "\${worker.name}" checked for drop updates\`);
        }, 1_000);

        return () => {
          clearInterval(interval);
          console.warn(\`Drop Desk worker "\${worker.name}" stopped\`);
        };
      };"
    `)
  })

  test('renames service references but not keys that share the name', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

export default unstable_defineService("worker", ({ service = fallback }) => {
  const api = { service() {}, label: service.name };
  return () => report({ service });
});`,
        'src/service.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import type { WebWorkerProps } from "sanity/dashboard";

      export default ({
        worker = fallback
      }: WebWorkerProps) => {
        const api = { service() {}, label: worker.name };
        return () => report({ service: worker });
      };"
    `)
  })

  test('keeps service as the variable name when the worker already uses worker', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

export default unstable_defineService("worker", ({ service }) => {
  const worker = new Worker(service.name);
  return () => worker.terminate();
});`,
        'src/service.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import type { WebWorkerProps } from "sanity/dashboard";

      export default ({
        worker: service
      }: WebWorkerProps) => {
        const worker = new Worker(service.name);
        return () => worker.terminate();
      };"
    `)
  })

  test('renames service on a props object and keeps the import while a type still uses it', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

type ServiceBus = Parameters<Parameters<typeof unstable_defineService>[1]>[0]["bus"];

export default unstable_defineService("worker", (context) => {
  console.log(context.service.name);
});`,
        'src/services/feed.ts',
      ),
    ).toMatchInlineSnapshot(`
      "import { unstable_defineService } from "sanity/dashboard";

      import type { WebWorkerProps } from "sanity/dashboard";

      type ServiceBus = Parameters<Parameters<typeof unstable_defineService>[1]>[0]["bus"];

      export default (context: WebWorkerProps) => {
        console.log(context.worker.name);
      };"
    `)
  })

  test('leaves a JavaScript web worker untyped', () => {
    expect(
      migrate(
        `import { unstable_defineService } from "sanity/dashboard";

export default unstable_defineService("worker", ({ bus }) => {
  bus.emit("workers.message", { type: "ready" });
});`,
        'src/worker.js',
      ),
    ).toMatchInlineSnapshot(`
      "export default ({ bus }) => {
        bus.emit("workers.message", { type: "ready" });
      };"
    `)
  })

  test('leaves files without v1 views or web workers unchanged', () => {
    expect(migrate(`export default function App() {\n  return null;\n}`)).toBe('')
  })
})

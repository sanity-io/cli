#### [Sanity](https://www.sanity.io) is a real-time content infrastructure with a scalable, hosted backend featuring a Graph Oriented Query Language (GROQ), asset pipelines, and fast edge caches.

To get started with Sanity, please head over to our [getting started guide](https://sanity.io/docs/introduction/getting-started)

## Usage

```sh
npm create sanity@latest
```

Pass any `sanity init` flag after `--`, for example to set up a Studio without prompts:

```sh
npm create sanity@latest -- -y --project <id> --dataset production --output-path ./studio
```

Run `npm create sanity@latest -- --help` to list the flags.

## How it works

`create-sanity` is a single bundled file with no dependencies, so it starts quickly. It logs you in (or reuses an existing `sanity login`), lets you pick or create a project, dataset and Studio template, writes the project files, and installs dependencies. AI editor (MCP) and agent skills setup and sample dataset imports then run with the new project's own `sanity` CLI.

Anything else, such as app templates, remote templates, Next.js projects, `--bare`, `--env`, coupons and plans, is handed to `sanity init` from `@sanity/cli`.

## Development

`pnpm build` bundles `src/` into `dist/` and copies the Studio templates from `@sanity/cli`. Template definitions and config file generators are imported from `@sanity/cli` source at build time, so both initializers write the same files.

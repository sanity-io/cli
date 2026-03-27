# E2E Test Suite

Tests the Sanity CLI against real Sanity APIs — no mocking, no intercepted HTTP. The CLI runs as a real process inside a pseudo-terminal (`node-pty`) so `isTTY = true` and interactive code paths (spinners, prompts) behave exactly as they do for a real user.

## Structure

```
e2e/
├── .env.e2e              # Local credentials (gitignored)
├── global-setup.ts       # Loads .env.e2e, validates required env vars
├── helpers.ts            # sanity() subprocess wrapper
├── vitest.config.ts      # Separate config — not part of the main test suite
├── tests/
│   └── datasets.test.ts
└── README.md
```

## Running locally

**1. Create `e2e/.env.e2e`:**

```
SANITY_E2E_TOKEN=skAbC...
SANITY_E2E_PROJECT_ID=yourprojectid
E2E_VERBOSE=true
```

Get a token from [sanity.io/manage](https://sanity.io/manage) → your project → API → Tokens. Use **Editor** role minimum. The project should be a dedicated E2E test project.

The `.env.e2e` file is loaded automatically by `global-setup.ts` when the suite starts.

**2. Run the suite:**

```bash
pnpm test:e2e
```

This builds the CLI first, then runs the E2E suite.

**Verbose output** (streams terminal output in real-time):

```bash
E2E_VERBOSE=1 pnpm test:e2e
```

## CI

Planned: a nightly GitHub Actions workflow using `SANITY_E2E_TOKEN` and `SANITY_E2E_PROJECT_ID` as repository secrets, with automatic issue creation on failure.

## Troubleshooting

### `posix_spawnp failed`

This is almost always one of two things:

**node-pty version too old.** Versions prior to `1.2.0-beta.12` shipped `spawn-helper` without the executable bit set on macOS, causing this error when using pnpm (which preserves tarball permissions). The fix was applied in `1.2.0-beta.12`. If you see this error, check the version in `e2e/package.json` and run `pnpm install`.

**Node.js version incompatibility.** Older versions of node-pty had issues with certain Node.js versions. If you're seeing this error, check the version in `e2e/package.json` is `1.2.0-beta.12` or later and run `pnpm install`.

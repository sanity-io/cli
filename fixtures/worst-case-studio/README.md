# worst-case-studio

A collection of things we'd rather not have you do, but that we technically speaking
"have" to support for backwards compatibility or similar reasons.

## The Unfortunates List™

- TypeScript path aliases in CLI config (through typescript)
- TypeScript path aliases in studio config (through vite plugin)
- JSX in studio config
- CSS imports in studio config
- Font/SVG/file imports in studio config
- Browser-only globals in studio config
- Timers setup in studio config
- Top level await in studio config
- HTTP imports in studio config
- TypeScript syntax extensions (enums) in studio config
- CommonJS vs ESM
- Environment variables from `.env`
- Environment variables from `process.env` and `import.meta.env`
- Vite config from `sanity.cli.ts`, with global defines

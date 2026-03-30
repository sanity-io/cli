# @sanity/eslint-config-cli

Shared ESLint configuration for Sanity CLI packages.

## Requirements

- **ESLint** `^9.0.0` or `^10.0.0`
- **Node.js** `^18.18.0` (ESLint 9) or `^20.19.0 || ^22.13.0 || >=24` (ESLint 10)

## Installation

```bash
npm install --save-dev @sanity/eslint-config-cli eslint
```

or with pnpm:

```bash
pnpm add --save-dev @sanity/eslint-config-cli eslint
```

## Usage

Create an `eslint.config.mjs` file in your project root:

```javascript
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  ...eslintConfig,
  // Add your custom rules here
]
```

You can also extend or override specific rules:

```javascript
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  ...eslintConfig,
  {
    rules: {
      // Override or add custom rules
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]
```

## What's Included

This configuration includes:

- **ESLint recommended rules** - Core ESLint best practices
- **TypeScript ESLint** - TypeScript-specific linting rules
- **Import plugin** - Validates proper imports and prevents cycles
- **Node.js plugin** - Node.js best practices
- **Unicorn plugin** - Additional best practices and modern patterns
- **Perfectionist plugin** - Automatic sorting of imports, objects, and interfaces
- **TSDoc plugin** - Validates TSDoc comments
- **Unused imports** - Automatically detects and reports unused imports
- **Prettier compatibility** - Works seamlessly with Prettier

## Configuration Details

The configuration enforces:

- Natural sorting of imports with proper grouping
- Consistent code formatting
- TypeScript best practices
- Import validation and cycle detection
- Unused import detection
- Proper TSDoc syntax

## License

MIT © Sanity.io

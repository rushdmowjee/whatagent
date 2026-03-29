# Contributing to WhatAgent

## Prerequisites

- Node.js 20+
- npm 10+

## Local Setup

```bash
git clone https://github.com/rushdmowjee/whatagent.git
cd whatagent
npm install
```

## Development

```bash
npm run build    # compile TypeScript
npm run test     # run tests
npm run lint     # lint source
npm run dev      # watch mode
```

## Running Tests

Tests use Jest with ESM support:

```bash
npm test
```

## Project Structure

```
src/
  index.ts         # public exports
  WhatAgent.ts     # main SDK class
  types.ts         # shared types
  __tests__/       # test files
.github/workflows/
  ci.yml           # GitHub Actions: lint, test, build
```

## Submitting Changes

1. Create a branch from `main`
2. Make your changes with tests
3. Ensure `npm run lint && npm test && npm run build` all pass
4. Open a pull request against `main`

## Code Style

- TypeScript strict mode
- ESM modules (`import`/`export`)
- No `any` types without comment justification

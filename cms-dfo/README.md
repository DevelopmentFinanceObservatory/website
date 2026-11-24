# cms-dfo

The Sanity Studio for the Development Finance Observatory website (project `te5hxtq5`, dataset `production`). It runs on its own, apart from the Next.js app in the repository root, and is named `cms-dfo` to keep it distinct from DFO Studio at `/studio` on the site.

## Commands

Run these from `cms-dfo/`. The Studio has its own `package.json` and lockfile, so install here as well as at the root.

- `pnpm install` installs the Studio's dependencies.
- `pnpm dev` starts the Studio at http://localhost:3333.
- `pnpm typegen` extracts the schema to `schema.json` and writes query result types to `../src/sanity/sanity.types.ts` from the GROQ queries under `../src`.
- `npx sanity schemas deploy` uploads the schema so the Sanity MCP server and other tools can see it.
- `pnpm run deploy` deploys the Studio to Sanity hosting.

Content types live in `schemaTypes/` and are registered in `schemaTypes/index.ts`.

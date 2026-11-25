# cms-dfo

The Sanity Studio for the website in the repository root: project `te5hxtq5`, dataset `production`. The root `AGENTS.md` covers branches, commits, pull requests and writing. This file covers the Studio.

- Install and run commands from `cms-dfo/`, which has its own `package.json` and pnpm lockfile. `README.md` lists the commands.
- Content types live in `schemaTypes/documents/` and take effect only once listed in `schemaTypes/index.ts`.
- After changing a schema type or a GROQ query under `../src`, run `pnpm typegen` and commit the regenerated `../src/sanity/sanity.types.ts`. The script passes `--force` to the schema extract, which refuses to overwrite `schema.json` without it.
- Run `npx sanity schemas deploy` after a schema change so the Sanity MCP server sees the new types and fields.
- The website reads published documents from the public dataset without a token. Studio validation runs only in Studio, so `src/sanity/publications.ts` checks each document before the page renders it.
- `pnpm build` and `pnpm run deploy` resolve the Studio's packages on Sanity's module CDN for auto-updates. When that lookup fails, `npx sanity build --no-auto-updates` builds from the local install.

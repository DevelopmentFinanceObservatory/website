import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
    api: {
        projectId: 'te5hxtq5',
        dataset: 'production',
    },
    deployment: {
        /**
         * Enable auto-updates for studios.
         * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
         */
        autoUpdates: true,
    },
    // Reads GROQ queries from the website in the repository root and writes their result types
    // beside it. Run `pnpm typegen` here after a schema or query change.
    typegen: {
        enabled: true,
        path: '../src/**/*.{ts,tsx}',
        schema: 'schema.json',
        generates: '../src/sanity/sanity.types.ts',
        overloadClientMethods: true,
    },
})

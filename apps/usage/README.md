# Prisma IDB Usage Example

A test application for the [Prisma IndexedDB Client Generator](https://github.com/prisma-idb/idb-client-generator). This app demonstrates basic CRUD operations and serves as a validation suite for the generated client.

**[📖 Documentation](https://idb-client-generator-docs.vercel.app/) • [🚀 Live Kanban Demo](https://pidb-kanban-example.vercel.app/) • [📦 npm Package](https://www.npmjs.com/package/@prisma-idb/idb-client-generator) • [🏗️ Main Repository](https://github.com/prisma-idb/idb-client-generator)**

## About This App

This is an internal test application used to validate the generator output. For a complete working example with sync capabilities, see the [Kanban Example](../pidb-kanban-example/).

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Testing

Run automated tests:

```bash
npm run test
```

## Resources

- [Prisma IDB Generator Documentation](https://idb-client-generator-docs.vercel.app/)
- [Full Kanban Example with Sync](../pidb-kanban-example/)
- [GitHub Repository](https://github.com/prisma-idb/idb-client-generator)
- [npm Package](https://www.npmjs.com/package/@prisma-idb/idb-client-generator)

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

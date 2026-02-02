# Prisma IDB Documentation

The official documentation site for the [Prisma IndexedDB Client Generator](https://github.com/prisma-idb/idb-client-generator). Built with [Next.js](https://nextjs.org/) and [Fumadocs](https://fumadocs.dev/).

**[📖 Live Documentation](https://idb-client-generator-docs.vercel.app/) • [🚀 Live Demo](https://pidb-kanban-example.vercel.app/) • [📦 npm Package](https://www.npmjs.com/package/@prisma-idb/idb-client-generator) • [🏗️ Main Repository](https://github.com/prisma-idb/idb-client-generator)**

## About

This documentation site provides:

- **Getting Started Guide** - Quick setup and installation
- **API Reference** - Complete client API documentation
- **Sync Engine Guide** - Implementation and architecture of bidirectional sync
- **Schema Requirements** - Data model ownership invariants
- **Example Code** - Real-world usage patterns

## Development

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the documentation.

## Building

Build the static documentation:

```bash
pnpm build
```

## Project Structure

- `content/docs/` - Documentation content in MDX format
  - `(index)/` - Getting started and main documentation
  - `sync/` - Sync engine documentation and implementation guides
- `src/app/` - Next.js application structure
- `src/lib/` - Shared utilities and components

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Fumadocs Documentation](https://fumadocs.dev)
- [Prisma IDB Generator](https://github.com/prisma-idb/idb-client-generator)

## Contributing

To contribute to the documentation, please visit the [main repository](https://github.com/prisma-idb/idb-client-generator) and submit a pull request.

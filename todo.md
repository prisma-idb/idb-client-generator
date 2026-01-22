# Monorepo fixes

- instead of importing the client in generated `batch-processor.ts` file, pass the `prisma` client object as arguments to the functions that require it

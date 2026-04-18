import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  datasource: {
    url: "postgresql://postgres:postgres@localhost:5432/prisma_idb_benchmark",
  },
});

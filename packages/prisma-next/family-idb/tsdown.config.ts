import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/exports/pack.ts", "src/exports/control.ts", "src/exports/contract-ts.ts", "src/exports/config-types.ts"],
  format: ["esm"],
  dts: {
    enabled: true,
    sourcemap: true,
  },
  sourcemap: true,
  skipNodeModulesBundle: true,
  tsconfig: "tsconfig.prod.json",
});

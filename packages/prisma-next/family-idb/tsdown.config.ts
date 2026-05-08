import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/exports/pack.ts", "src/exports/control.ts"],
  format: ["esm"],
  dts: {
    enabled: true,
    sourcemap: true,
  },
  sourcemap: true,
  skipNodeModulesBundle: true,
  tsconfig: "tsconfig.prod.json",
});

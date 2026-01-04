import path from "path";
import type { GeneratorOptions, DMMF } from "@prisma/generator-helper";

export interface ParsedGeneratorConfig {
  prismaClientImport: string;
  prismaSingletonImport: string | null;
  outboxSync: boolean;
  outboxModelName: string;
  exportEnums: boolean;
  include: string[];
  exclude: string[];
  filteredModels: DMMF.Model[];
}

/**
 * Parse and validate generator configuration options
 * Extracts prisma client import path, outbox settings, and model filters
 */
export function parseGeneratorConfig(options: GeneratorOptions): ParsedGeneratorConfig {
  const { models } = options.dmmf.datamodel;
  const outputPath = options.generator.output?.value as string;
  const schemaPath = options.schemaPath;
  const schemaDir = path.dirname(schemaPath);
  const generatorConfig = options.generator.config;

  // === Infer Prisma client import path ===
  const clientGenerator = options.otherGenerators.find(
    (gen) => gen.provider.value === "prisma-client" || gen.provider.value === "prisma-client-js",
  );

  if (!clientGenerator?.output?.value) {
    throw new Error(
      `@prisma-idb/idb-client-generator requires a "prisma-client" or "prisma-client-js" generator to be configured in your schema.prisma.\n\n` +
        `Please add one of the following:\n\n` +
        `For the new Prisma client generator:\n` +
        `generator client {\n` +
        `  provider = "prisma-client"\n` +
        `  output   = "./src/generated/prisma"\n` +
        `}\n\n` +
        `Or for the legacy generator:\n` +
        `generator client {\n` +
        `  provider = "prisma-client-js"\n` +
        `  output   = "./src/generated/prisma"\n` +
        `}`,
    );
  }

  let prismaClientImport: string;
  const clientOutputPath = clientGenerator.output.value;

  try {
    // Calculate relative path from the 'client' subdirectory (since files go in client/ or server/)
    const relPath = path.relative(path.join(outputPath, "client"), clientOutputPath).replace(/\\/g, "/");
    const baseImport = relPath.startsWith("..") || relPath.startsWith(".") ? relPath : `./${relPath}`;

    // For prisma-client provider, append /client to the path
    prismaClientImport = clientGenerator.provider.value === "prisma-client" ? `${baseImport}/client` : baseImport;
  } catch {
    // Fallback to absolute path if relative path computation fails
    prismaClientImport =
      clientGenerator.provider.value === "prisma-client" ? `${clientOutputPath}/client` : clientOutputPath;
  }

  // === Parse outbox settings ===
  const outboxSync = generatorConfig.outboxSync === "true";
  const outboxModelName = (generatorConfig.outboxModelName as string) || "OutboxEvent";

  // === Parse exportEnums setting ===
  const exportEnums = generatorConfig.exportEnums === "true";

  // === Parse Prisma singleton import path ===
  let prismaSingletonImport: string | null = null;
  const prismaSingletonImportConfig = generatorConfig.prismaSingletonImport as string | undefined;

  if (prismaSingletonImportConfig) {
    try {
      // Resolve both paths to absolute, then calculate relative
      const serverDir = path.isAbsolute(outputPath)
        ? path.join(outputPath, "server")
        : path.resolve(schemaDir, outputPath, "server");

      const singletonAbsPath = path.isAbsolute(prismaSingletonImportConfig)
        ? prismaSingletonImportConfig
        : path.resolve(schemaDir, prismaSingletonImportConfig);

      // Calculate relative path from server directory to singleton
      const relPath = path.relative(serverDir, singletonAbsPath).replace(/\\/g, "/");
      prismaSingletonImport = relPath.startsWith("..") || relPath.startsWith(".") ? relPath : `./${relPath}`;
    } catch {
      // Fallback to the configured path if relative path computation fails
      prismaSingletonImport = prismaSingletonImportConfig;
    }
  }

  // === Parse include/exclude patterns ===
  let include: string[] = ["*"];
  let exclude: string[] = [];

  if (typeof generatorConfig.include === "string") {
    include = generatorConfig.include.split(",").map((s) => s.trim());
  } else if (Array.isArray(generatorConfig.include)) {
    include = generatorConfig.include;
  }

  if (typeof generatorConfig.exclude === "string") {
    exclude = generatorConfig.exclude.split(",").map((s) => s.trim());
  } else if (Array.isArray(generatorConfig.exclude)) {
    exclude = generatorConfig.exclude;
  }

  // Validate XOR: either include or exclude, not both
  if (include.length > 0 && include[0] !== "*" && exclude.length > 0) {
    throw new Error(
      `@prisma-idb/idb-client-generator: "include" and "exclude" are mutually exclusive (XOR).\n` +
        `You can use either "include" or "exclude", but not both.`,
    );
  }

  // === Filter models based on include/exclude patterns ===
  const matchPattern = (name: string, pattern: string): boolean => {
    const globToRegex = (glob: string): RegExp => {
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const withWildcard = escaped.replace(/\\\*/g, ".*");
      return new RegExp(`^${withWildcard}$`);
    };
    return globToRegex(pattern).test(name);
  };

  const isIncluded = (modelName: string) => {
    if (include[0] !== "*") {
      return include.some((pattern) => matchPattern(modelName, pattern));
    }
    return !exclude.some((pattern) => matchPattern(modelName, pattern));
  };

  const filteredModels = models.filter((model) => isIncluded(model.name));

  return {
    prismaClientImport,
    prismaSingletonImport,
    outboxSync,
    outboxModelName,
    exportEnums,
    include,
    exclude,
    filteredModels,
  };
}

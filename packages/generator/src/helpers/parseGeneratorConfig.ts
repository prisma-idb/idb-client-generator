import path from "path";
import type { GeneratorOptions, DMMF } from "@prisma/generator-helper";
import { getProjectedFilteredModels } from "./getFilteredModels";

export interface ParsedGeneratorConfig {
  prismaClientImport: string;
  exportEnums: boolean;
  include: string[];
  exclude: string[];
  filteredModels: DMMF.Model[];
  outboxSync: boolean;
  outboxModelName: string;
  versionMetaModelName: string;
  rootModel?: DMMF.Model;
}

/**
 * Parse and validate generator configuration options
 * Extracts prisma client import path, outbox settings, and model filters
 */
export function parseGeneratorConfig(options: GeneratorOptions): ParsedGeneratorConfig {
  const { models, enums } = options.dmmf.datamodel;
  const outputPath = options.generator.output?.value as string;
  const generatorConfig = options.generator.config;

  // === Infer Prisma client import path ===
  const clientGenerator = options.otherGenerators.find(
    (gen) => gen.provider.value === "prisma-client" || gen.provider.value === "prisma-client-js"
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
        `}`
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
  const versionMetaModelName = (generatorConfig.versionMetaModelName as string) || "VersionMeta";

  const rootModelString = generatorConfig.rootModel as string | undefined;
  if (outboxSync && !rootModelString) {
    throw new Error(
      `@prisma-idb/idb-client-generator: "rootModel" must be specified in the generator config when "outboxSync" is enabled.`
    );
  }

  // === Validate root model exists ===
  const rootModel = rootModelString ? models.find((m) => m.name === rootModelString) : undefined;
  if (rootModelString && !rootModel) {
    throw new Error(
      `@prisma-idb/idb-client-generator: Specified root model "${rootModelString}" does not exist in the Prisma schema.`
    );
  }

  // === Validate Changelog model and ChangeOperation enum if sync is enabled ===
  if (outboxSync) {
    validateChangelogSchema(models, enums);
  }

  // === Parse exportEnums setting ===
  const exportEnums = generatorConfig.exportEnums === "true";

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

  // Define matchPattern before using it
  const matchPattern = (name: string, pattern: string): boolean => {
    const globToRegex = (glob: string): RegExp => {
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const withWildcard = escaped.replace(/\\\*/g, ".*");
      return new RegExp(`^${withWildcard}$`);
    };
    return globToRegex(pattern).test(name);
  };

  // === Auto-exclude Changelog model ===
  // Check if user is trying to manually include Changelog
  if (include[0] !== "*" && include.some((pattern) => matchPattern("Changelog", pattern))) {
    throw new Error(
      `@prisma-idb/idb-client-generator: "Changelog" model is automatically excluded and cannot be manually included. It is reserved for internal sync infrastructure.`
    );
  }

  // Auto-exclude Changelog (unless it's already in exclude list to avoid redundancy)
  if (!exclude.includes("Changelog")) {
    exclude.push("Changelog");
  }

  // Validate XOR: either include or exclude, not both
  if (include.length > 0 && include[0] !== "*" && exclude.length > 1) {
    throw new Error(
      `@prisma-idb/idb-client-generator: "include" and "exclude" are mutually exclusive (XOR).\n` +
        `You can use either "include" or "exclude", but not both.`
    );
  }

  const isIncluded = (modelName: string) => {
    if (include[0] !== "*") {
      return include.some((pattern) => matchPattern(modelName, pattern));
    }
    return !exclude.some((pattern) => matchPattern(modelName, pattern));
  };

  const filteredModels = getProjectedFilteredModels(models.filter((model) => isIncluded(model.name)));

  return {
    prismaClientImport,
    outboxSync,
    outboxModelName,
    versionMetaModelName,
    exportEnums,
    include,
    exclude,
    filteredModels,
    rootModel,
  };
}

function validateChangelogSchema(models: readonly DMMF.Model[], enums: readonly DMMF.DatamodelEnum[]) {
  // Check for Changelog model
  const changelogModel = models.find((m) => m.name === "Changelog");
  if (!changelogModel) {
    throw new Error(
      `@prisma-idb/idb-client-generator: A "Changelog" model is required when "outboxSync" is enabled.\n\n` +
        `Add the following to your schema:\n\n` +
        `model Changelog {\n` +
        `  id            String          @id @default(uuid(7))\n` +
        `  model         String\n` +
        `  keyPath       Json\n` +
        `  operation     ChangeOperation\n` +
        `  scopeKey      String\n` +
        `  outboxEventId String          @unique\n` +
        `  @@index([model, id])\n` +
        `}\n\n` +
        `enum ChangeOperation {\n` +
        `  create\n` +
        `  update\n` +
        `  delete\n` +
        `}`
    );
  }

  // Validate Changelog model has exactly 6 fields
  const expectedFieldCount = 6;
  if (changelogModel.fields.length !== expectedFieldCount) {
    throw new Error(
      `@prisma-idb/idb-client-generator: Changelog model must have exactly ${expectedFieldCount} fields, but has ${changelogModel.fields.length}.`
    );
  }

  // Validate each field individually with switch cases
  for (const field of changelogModel.fields) {
    switch (field.name) {
      case "id":
        if (field.type !== "String") {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.id must be of type String, got ${field.type}.`);
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.id must not be a list.`);
        }
        if (!field.isId) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.id must have @id attribute.`);
        }
        if (!field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.id must have @default(uuid(7)).`);
        }
        if (
          typeof field.default !== "object" ||
          !("name" in field.default) ||
          field.default.name !== "uuid" ||
          !field.default.args ||
          field.default.args[0] !== 7
        ) {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.id @default must be uuid(7), got ${typeof field.default === "object" && "name" in field.default ? field.default.name : field.default}.`
          );
        }
        break;

      case "model":
        if (field.type !== "String") {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.model must be of type String, got ${field.type}.`
          );
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.model must not be a list.`);
        }
        if (!field.isRequired) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.model must be required (no ? modifier).`);
        }
        if (field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.model must not have a default value.`);
        }
        break;

      case "keyPath":
        if (field.type !== "Json") {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.keyPath must be of type Json, got ${field.type}.`
          );
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.keyPath must not be a list.`);
        }
        if (!field.isRequired) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.keyPath must be required (no ? modifier).`);
        }
        if (field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.keyPath must not have a default value.`);
        }
        break;

      case "operation":
        if (field.type !== "ChangeOperation") {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.operation must be of type ChangeOperation, got ${field.type}.`
          );
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.operation must not be a list.`);
        }
        if (!field.isRequired) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.operation must be required (no ? modifier).`);
        }
        if (field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.operation must not have a default value.`);
        }
        break;

      case "scopeKey":
        if (field.type !== "String") {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.scopeKey must be of type String, got ${field.type}.`
          );
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.scopeKey must not be a list.`);
        }
        if (!field.isRequired) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.scopeKey must be required (no ? modifier).`);
        }
        if (field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.scopeKey must not have a default value.`);
        }
        break;

      case "outboxEventId":
        if (field.type !== "String") {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.outboxEventId must be of type String, got ${field.type}.`
          );
        }
        if (field.isList) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.outboxEventId must not be a list.`);
        }
        if (!field.isRequired) {
          throw new Error(
            `@prisma-idb/idb-client-generator: Changelog.outboxEventId must be required (no ? modifier).`
          );
        }
        if (!field.isUnique) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.outboxEventId must have @unique attribute.`);
        }
        if (field.hasDefaultValue) {
          throw new Error(`@prisma-idb/idb-client-generator: Changelog.outboxEventId must not have a default value.`);
        }
        break;

      default:
        throw new Error(
          `@prisma-idb/idb-client-generator: Changelog model has unexpected field "${field.name}". Only these fields are allowed: id, model, keyPath, operation, scopeKey, outboxEventId.`
        );
    }
  }

  // Check for ChangeOperation enum
  const changeOperationEnum = enums.find((e) => e.name === "ChangeOperation");
  if (!changeOperationEnum) {
    throw new Error(
      `@prisma-idb/idb-client-generator: A "ChangeOperation" enum is required when "outboxSync" is enabled.\n\n` +
        `Add the following to your schema:\n\n` +
        `enum ChangeOperation {\n` +
        `  create\n` +
        `  update\n` +
        `  delete\n` +
        `}`
    );
  }

  // Validate ChangeOperation enum has exactly 3 values
  if (changeOperationEnum.values.length !== 3) {
    throw new Error(
      `@prisma-idb/idb-client-generator: ChangeOperation enum must have exactly 3 values (create, update, delete), but has ${changeOperationEnum.values.length}.`
    );
  }

  // Validate each enum value with switch case
  const enumValueNames = new Set<string>();
  for (const enumValue of changeOperationEnum.values) {
    enumValueNames.add(enumValue.name);
    switch (enumValue.name) {
      case "create":
      case "update":
      case "delete":
        // Valid values, continue
        break;
      default:
        throw new Error(
          `@prisma-idb/idb-client-generator: ChangeOperation enum has invalid value "${enumValue.name}". Only valid values are: create, update, delete.`
        );
    }
  }

  // Verify all required values are present
  const requiredEnumValues = ["create", "update", "delete"];
  for (const required of requiredEnumValues) {
    if (!enumValueNames.has(required)) {
      throw new Error(
        `@prisma-idb/idb-client-generator: ChangeOperation enum is missing required value "${required}". Required values: create, update, delete.`
      );
    }
  }
}

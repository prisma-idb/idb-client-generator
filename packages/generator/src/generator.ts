import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import path from "path";
import { Project, Scope, StructureKind, VariableDeclarationKind } from "ts-morph";
import { generateIDBKey, toCamelCase, writeFileSafely } from "./utils";

const { version } = require("../package.json");

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    // TODO: handle enums
    const { models, enums } = options.dmmf.datamodel;

    const project = new Project();
    const file = project.createSourceFile(path.join("prisma-idb-client.ts"), "", { overwrite: true });

    file.addImportDeclaration({
      moduleSpecifier: "idb",
      namedImports: ["openDB"],
    });
    file.addImportDeclaration({
      moduleSpecifier: "idb",
      namedImports: ["IDBPDatabase"],
      isTypeOnly: true,
    });
    file.addImportDeclaration({
      moduleSpecifier: "@prisma/client",
      namedImports: ["Prisma"],
      isTypeOnly: true,
    });

    // TODO: update version numbers if schema changes
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [{ name: "IDB_VERSION", type: "number", initializer: "1" }],
    });

    file.addClass({
      name: "PrismaIDBClient",
      isExported: true,
      ctors: [{ scope: Scope.Private }],
      properties: [
        { name: "instance", isStatic: true, type: "PrismaIDBClient", scope: Scope.Private },
        { name: "db", type: "IDBPDatabase", hasExclamationToken: true },
        ...models.map((model) => ({
          name: toCamelCase(model.name),
          type: `IDB${model.name}`,
          hasExclamationToken: true,
        })),
      ],
      methods: [
        {
          name: "getInstance",
          isStatic: true,
          isAsync: true,
          returnType: "Promise<PrismaIDBClient>",
          statements: (writer) => {
            writer
              .writeLine("if (!PrismaIDBClient.instance) {")
              .indent(() => {
                writer
                  .writeLine("PrismaIDBClient.instance = new PrismaIDBClient();")
                  .writeLine("await PrismaIDBClient.instance.createDatabase();");
              })
              .writeLine("}")
              .writeLine("return PrismaIDBClient.instance;");
          },
        },
        {
          name: "createDatabase",
          scope: Scope.Protected,
          isAsync: true,
          statements: (writer) => {
            writer
              .writeLine("this.db = await openDB('prisma-idb', IDB_VERSION, {")
              .indent(() => {
                writer
                  .writeLine("upgrade(db) {")
                  .indent(() => {
                    models.forEach((model) => {
                      writer.writeLine(
                        `db.createObjectStore('${toCamelCase(model.name)}', { keyPath: ${generateIDBKey(model)} });`,
                      );
                    });
                  })
                  .writeLine("}");
              })
              .writeLine("});");

            models.forEach((model) => {
              writer.writeLine(`this.${toCamelCase(model.name)} = new IDB${model.name}(this.db);`);
            });
          },
        },
      ],
    });

    file.addClass({
      name: "BaseIDBModelClass",
      properties: [{ name: "db", type: "IDBPDatabase" }],
      ctors: [
        {
          parameters: [{ name: "db", type: "IDBPDatabase" }],
          statements: (writer) => writer.writeLine("this.db = db"),
        },
      ],
    });

    models.forEach((model) => {
      file.addClass({
        name: `IDB${model.name}`,
        extends: "BaseIDBModelClass",
        methods: [
          {
            name: "findFirst",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}FindFirstArgs` }],
            statements: (writer) => {
              // TODO: full prisma query mapping, first perform get or getAll and filter based on query
              writer.writeLine(`const records = await this.db.getAll("${toCamelCase(model.name)}");`);
              // TODO: apply filters according to query
              writer.writeLine("return records;");
            },
          },
          {
            name: "findMany",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}FindManyArgs` }],
            statements: (writer) => {
              // TODO: full prisma query mapping
              writer.writeLine(`return await this.db.getAll("${toCamelCase(model.name)}");`);
            },
          },
          {
            name: "findUnique",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}FindUniqueArgs` }],
            statements: (writer) => {
              if (model.primaryKey) {
                writer.writeLine(`const keyFieldName = "${model.primaryKey.fields.join("_")}"`);
                writer.writeLine(
                  `return (await this.db.get("${toCamelCase(model.name)}", Object.values(query.where[keyFieldName]!))) ?? null;`,
                );
              } else {
                const identifierFieldName = JSON.parse(generateIDBKey(model))[0];
                writer
                  .writeLine(`if (query.where.${identifierFieldName}) {`)
                  .indent(() =>
                    writer.writeLine(
                      `return (await this.db.get("${toCamelCase(model.name)}", [query.where.${identifierFieldName}])) ?? null;`,
                    ),
                  )
                  .writeLine("}");
                writer.writeLine(`throw new Error("@unique index has not been created");`);
                // TODO: @unique indexes if needed
              }
            },
          },
          {
            name: "create",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}CreateArgs` }],
            statements: (writer) => {
              // TODO: full prisma query mapping with modifiers (@autoincrement, @cuid, @default, etc.)
              writer.writeLine(`await this.db.add("${model.name}", query);`);
            },
          },
        ],
      });
    });

    console.log(file.getText());

    const writeLocation = path.join(options.generator.output?.value!, file.getBaseName());
    await writeFileSafely(writeLocation, file.getText());
  },
});

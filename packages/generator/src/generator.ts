import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import path from "path";
import { Project, Scope, VariableDeclarationKind } from "ts-morph";
import { version } from "../package.json";
import { outputUtilsText } from "./outputUtils";
import { generateIDBKey, getNonKeyUniqueFields, toCamelCase, writeFileSafely } from "./utils";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const { models } = options.dmmf.datamodel;

    const project = new Project();
    const file = project.createSourceFile("prisma-idb-client.ts", "", { overwrite: true });

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
    file.addImportDeclaration({
      moduleSpecifier: "./utils",
      namedImports: ["filterByWhereClause"],
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
                      const uniqueFields = getNonKeyUniqueFields(model);
                      const keyPath = generateIDBKey(model);

                      let declarationLine = uniqueFields.length ? `const ${model.name}Store = ` : ``;
                      declarationLine += `db.createObjectStore('${toCamelCase(model.name)}', { keyPath: ${keyPath} });`;

                      writer.writeLine(declarationLine);
                      uniqueFields.forEach(({ name }) => {
                        // TODO: perhaps an option to skip index creation on unique fields in the generator config?
                        writer.writeLine(
                          `${model.name}Store.createIndex("${name}Index", "${name}", { unique: true });`,
                        );
                      });
                    });
                  })
                  .writeLine("}");
              })
              .writeLine("});");

            models.forEach((model) => {
              writer.writeLine(
                `this.${toCamelCase(model.name)} = new IDB${model.name}(this.db, ${generateIDBKey(model)});`,
              );
            });
          },
        },
      ],
    });

    file.addClass({
      name: "BaseIDBModelClass",
      properties: [
        { name: "db", type: "IDBPDatabase" },
        { name: "keyPath", type: "string[]" },
      ],
      ctors: [
        {
          parameters: [
            { name: "db", type: "IDBPDatabase" },
            { name: "keyPath", type: "string[]" },
          ],
          statements: (writer) => {
            writer.writeLine("this.db = db");
            writer.writeLine("this.keyPath = keyPath");
          },
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
            typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindFirstArgs` }],
            parameters: [{ name: "query", type: "T" }],
            returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
            statements: (writer) => {
              // TODO: full prisma query mapping, first perform get or getAll and filter based on query
              // TODO: includes relations in here
              writer
                .writeLine(`const records = filterByWhereClause(`)
                .indent(() => {
                  writer.writeLine(`await this.db.getAll("${toCamelCase(model.name)}"), this.keyPath, query.where`);
                })
                .writeLine(`) as Prisma.${model.name}GetPayload<T>[];`);

              // also consider performance overhead: use webWorkers, index utilization, compound indexes, batch processing, etc.
              writer.writeLine("return records[0] ?? null;");
            },
          },
          {
            name: "findMany",
            isAsync: true,
            typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindManyArgs` }],
            parameters: [{ name: "query", type: "T" }],
            returnType: `Promise<Prisma.${model.name}GetPayload<T>[]>`,
            statements: (writer) => {
              // TODO: full prisma query mapping
              writer.writeLine(`return await this.db.getAll("${toCamelCase(model.name)}");`);
            },
          },
          {
            name: "findUnique",
            isAsync: true,
            typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindUniqueArgs` }],
            parameters: [{ name: "query", type: "T" }],
            returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
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

                const uniqueFields = getNonKeyUniqueFields(model).map(({ name }) => name);
                uniqueFields.forEach((uniqueField) => {
                  writer
                    .writeLine(`if (query.where.${uniqueField}) {`)
                    .indent(() => {
                      writer.writeLine(
                        `return (await this.db.getFromIndex("${toCamelCase(model.name)}", "${uniqueField}Index", query.where.${uniqueField})) ?? null;`,
                      );
                    })
                    .writeLine("}");
                });
                // TODO: select, include, and where clauses
                writer.writeLine(`throw new Error("No unique field provided in the where clause");`);
              }
            },
          },
          {
            name: "create",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}CreateArgs` }],
            statements: (writer) => {
              // TODO: full prisma query mapping with modifiers (@autoincrement, @cuid, @default, etc.)
              // TODO: also should return the created object
              // TODO: nested creates, connects, and createMany
              writer.writeLine(`await this.db.add("${toCamelCase(model.name)}", query.data);`);
            },
          },
          {
            name: "createMany",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}CreateManyArgs` }],
            statements: (writer) => {
              writer.writeLine(`const tx = this.db.transaction('${toCamelCase(model.name)}', 'readwrite')`);
              writer.writeLine(`const queryData = Array.isArray(query.data) ? query.data : [query.data];`);
              writer
                .writeLine(`await Promise.all([`)
                .indent(() => {
                  // TODO: full prisma query mapping with modifiers (@autoincrement, @cuid, @default, etc.)
                  writer.writeLine(`...queryData.map((record) => tx.store.add(record)),`);
                  writer.writeLine("tx.done");
                })
                .writeLine("])");
            },
          },
          {
            name: "delete",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}DeleteArgs` }],
            statements: (writer) => {
              // TODO: handle cascades
            },
          },
          {
            name: "deleteMany",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}DeleteManyArgs` }],
            statements: (writer) => {
              // TODO: handle cascades
            },
          },
        ],
      });
    });

    const writeLocation = path.join(options.generator.output?.value as string, file.getBaseName());
    await writeFileSafely(writeLocation, file.getText());

    await writeFileSafely(path.join(options.generator.output?.value as string, "utils.ts"), outputUtilsText);
  },
});

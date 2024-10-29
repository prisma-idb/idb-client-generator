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
          name: "create",
          isStatic: true,
          isAsync: true,
          scope: Scope.Public,
          returnType: "Promise<PrismaIDBClient>",
          statements: (writer) => {
            writer
              .writeLine("if (!PrismaIDBClient.instance) {")
              .indent(() => {
                writer
                  .writeLine("const client = PrismaIDBClient.instance = new PrismaIDBClient();")
                  .writeLine("await client.initialize();")
                  .writeLine("PrismaIDBClient.instance = client;");
              })
              .writeLine("}")
              .writeLine("return PrismaIDBClient.instance;");
          },
        },
        {
          name: "initialize",
          scope: Scope.Private,
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
                `this.${toCamelCase(model.name)} = new IDB${model.name}(this, ${generateIDBKey(model)});`,
              );
            });
          },
        },
      ],
    });

    file.addClass({
      name: "BaseIDBModelClass",
      properties: [
        { name: "client", type: "PrismaIDBClient" },
        { name: "keyPath", type: "string[]" },
      ],
      ctors: [
        {
          parameters: [
            { name: "client", type: "PrismaIDBClient" },
            { name: "keyPath", type: "string[]" },
          ],
          statements: (writer) => {
            writer.writeLine("this.client = client");
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
            typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindFirstArgs | undefined` }],
            parameters: [{ name: "query", type: "T" }],
            returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
            statements: (writer) => {
              // TODO: includes relations in here, use indexes
              // also consider performance overhead: use webWorkers, index utilization, compound indexes, batch processing, etc.
              writer.writeLine("return (await this.findMany(query))[0] ?? null;");
            },
          },
          {
            name: "findMany",
            isAsync: true,
            typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindManyArgs | undefined` }],
            parameters: [{ name: "query", type: "T" }],
            returnType: `Promise<Prisma.${model.name}GetPayload<T>[]>`,
            statements: (writer) => {
              // TODO: orderBy, indexes
              writer.writeLine(`let records = await this.client.db.getAll("${toCamelCase(model.name)}");`);
              // TODO: includes and nested select part
              // const relationFields = model.fields.filter(({ kind }) => kind === "object");
              // relationFields.forEach((field) => {
              //   writer
              //     .writeLine(
              //       `if (query.include?.${toCamelCase(field.name)} || query.select?.${toCamelCase(field.name)}) {`,
              //     )
              //     .indent(() => {
              //       writer
              //         .writeLine(`records = records.map((record) => ({`)
              //         .indent(() => {
              //           writer.writeLine(`...record,`);
              //           writer.writeLine(`${field.name}: `)
              //         })
              //         .writeLine(`}));`);
              //     })
              //     .writeLine(`}`);
              // });
              writer
                .writeLine(`return filterByWhereClause(`)
                .indent(() => {
                  writer.writeLine(`records, this.keyPath, query?.where`);
                })
                .writeLine(`) as Prisma.${model.name}GetPayload<T>[];`);
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
                  `return (await this.client.db.get("${toCamelCase(model.name)}", Object.values(query.where[keyFieldName]!))) ?? null;`,
                );
              } else {
                const identifierFieldName = JSON.parse(generateIDBKey(model))[0];
                writer
                  .writeLine(`if (query.where.${identifierFieldName}) {`)
                  .indent(() =>
                    writer.writeLine(
                      `return (await this.client.db.get("${toCamelCase(model.name)}", [query.where.${identifierFieldName}])) ?? null;`,
                    ),
                  )
                  .writeLine("}");

                const uniqueFields = getNonKeyUniqueFields(model).map(({ name }) => name);
                uniqueFields.forEach((uniqueField) => {
                  writer
                    .writeLine(`if (query.where.${uniqueField}) {`)
                    .indent(() => {
                      writer.writeLine(
                        `return (await this.client.db.getFromIndex("${toCamelCase(model.name)}", "${uniqueField}Index", query.where.${uniqueField})) ?? null;`,
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
              writer.writeLine(`await this.client.db.add("${toCamelCase(model.name)}", query.data);`);
            },
          },
          {
            name: "createMany",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}CreateManyArgs` }],
            statements: (writer) => {
              writer.writeLine(`const tx = this.client.db.transaction('${toCamelCase(model.name)}', 'readwrite')`);
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
              // TODO: use indexes
              writer
                .writeLine(`const records = filterByWhereClause(`)
                .indent(() => {
                  writer.writeLine(`await this.client.db.getAll("${toCamelCase(model.name)}"),`);
                  writer.writeLine(`this.keyPath,`);
                  writer.writeLine(`query.where,`);
                })
                .writeLine(`)`);
              writer.writeLine(`if (records.length === 0) return;`);
              writer.blankLine();
              writer
                .writeLine(`await this.client.db.delete(`)
                .indent(() => {
                  writer.writeLine(`"${toCamelCase(model.name)}",`);
                  writer.writeLine(`this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),`);
                })
                .writeLine(`);`);
            },
          },
          {
            name: "deleteMany",
            isAsync: true,
            parameters: [{ name: "query", type: `Prisma.${model.name}DeleteManyArgs | undefined` }],
            statements: (writer) => {
              // TODO: handle cascades, use indexes
              writer
                .writeLine(`const records = filterByWhereClause(`)
                .indent(() => {
                  writer.writeLine(`await this.client.db.getAll("${toCamelCase(model.name)}"),`);
                  writer.writeLine(`this.keyPath,`);
                  writer.writeLine(`query?.where,`);
                })
                .writeLine(`)`);
              writer.writeLine(`if (records.length === 0) return;`);
              writer.blankLine();
              writer.writeLine(`const tx = this.client.db.transaction("${toCamelCase(model.name)}", "readwrite");`);
              writer
                .writeLine(`await Promise.all([`)
                .indent(() => {
                  writer
                    .writeLine(`...records.map((record) => `)
                    .indent(() => {
                      writer.writeLine(
                        `tx.store.delete(this.keyPath.map((keyField) => record[keyField] as IDBValidKey))`,
                      );
                    })
                    .writeLine(`),`);
                  writer.writeLine(`tx.done,`);
                })
                .writeLine(`]);`);
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

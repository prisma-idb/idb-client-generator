import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addAggregateMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "aggregate",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: "Prisma.Args<T, 'aggregate'>" }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "aggregate">>`,
    statements: (writer) => {
      writeRetrieveRecords(writer);
      writeWhereClause(writer);
      writeResultsInitialization(writer);
      writeCountCalculation(writer);
      writeSumCalculation(writer);
      writeMinCalculation(writer);
      writeMaxCalculation(writer);
      writeReturnResults(writer);
    },
  });
}

function writeRetrieveRecords(writer: CodeBlockWriter) {
  writer.writeLine("let records = await this.client.db.getAll(this.model.name);").blankLine();
}

function writeWhereClause(writer: CodeBlockWriter) {
  writer
    .writeLine("if (query.where) {")
    .indent(() => {
      writer.writeLine(
        "records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query.where);",
      );
    })
    .writeLine("}")
    .blankLine();
}

function writeResultsInitialization(writer: CodeBlockWriter) {
  writer.writeLine("const results = {};").blankLine();
}

function writeCountCalculation(writer: CodeBlockWriter) {
  writer
    .writeLine("if (query._count) {")
    .indent(() => {
      writer
        .writeLine("const calculateCount = (records, countQuery) => {")
        .indent(() => {
          writer
            .writeLine("const [key] = Object.keys(countQuery);")
            .writeLine("return records.filter(record => key in record && record[key] === countQuery[key]).length;");
        })
        .writeLine("};")
        .writeLine("results._count = calculateCount(records, query._count);");
    })
    .writeLine("}")
    .blankLine();
}

function writeSumCalculation(writer: CodeBlockWriter) {
  writer
    .writeLine("if (query._sum) {")
    .indent(() => {
      writer
        .writeLine("const calculateSum = (records, sumQuery) => {")
        .indent(() => {
          writer
            .writeLine("const [key] = Object.keys(sumQuery);")
            .writeLine("const numericValues = records")
            .indent(() => {
              writer
                .writeLine(".map(record => (typeof record[key] === 'number' ? record[key] : null))")
                .writeLine(".filter(value => value !== null);");
            })
            .writeLine("return numericValues.length ? numericValues.reduce((acc, val) => acc + val, 0) : 0;");
        })
        .writeLine("};")
        .writeLine("results._sum = calculateSum(records, query._sum);");
    })
    .writeLine("}")
    .blankLine();
}

function writeMinCalculation(writer: CodeBlockWriter) {
  writer
    .writeLine("if (query._min) {")
    .indent(() => {
      writer
        .writeLine("const calculateMin = (records, minQuery) => {")
        .indent(() => {
          writer
            .writeLine("const [key] = Object.keys(minQuery);")
            .writeLine("const numericValues = records")
            .indent(() => {
              writer
                .writeLine(".map(record => (typeof record[key] === 'number' ? record[key] : null))")
                .writeLine(".filter(value => value !== null);");
            })
            .writeLine("return numericValues.length ? Math.min(...numericValues) : null;");
        })
        .writeLine("};")
        .writeLine("results._min = calculateMin(records, query._min);");
    })
    .writeLine("}")
    .blankLine();
}

function writeMaxCalculation(writer: CodeBlockWriter) {
  writer
    .writeLine("if (query._max) {")
    .indent(() => {
      writer
        .writeLine("const calculateMax = (records, maxQuery) => {")
        .indent(() => {
          writer
            .writeLine("const [key] = Object.keys(maxQuery);")
            .writeLine("const numericValues = records")
            .indent(() => {
              writer
                .writeLine(".map(record => (typeof record[key] === 'number' ? record[key] : null))")
                .writeLine(".filter(value => value !== null);");
            })
            .writeLine("return numericValues.length ? Math.max(...numericValues) : null;");
        })
        .writeLine("};")
        .writeLine("results._max = calculateMax(records, query._max);");
    })
    .writeLine("}")
    .blankLine();
}

function writeReturnResults(writer: CodeBlockWriter) {
  writer.writeLine("return results as Prisma.Result<T, Q, 'aggregate'>;");
}

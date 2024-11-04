import { ClassDeclaration } from "ts-morph";

export function addAggregateMethod(modelClass: ClassDeclaration) {
  // TODO Implement Average
  modelClass.addMethod({
    name: "aggregate",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: "Prisma.Args<T, 'aggregate'>" }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "aggregate">>`,
    statements: (writer) => {
      writer
        .writeLine("let records = await this.client.db.getAll(`${toCamelCase(this.model.name)}`);")
        .writeLine("if (query.where) {")
        .writeLine(
          "records = filterByWhereClause(await this.client.db.getAll(toCamelCase(this.model.name)),this.keyPath,query?.where,);",
        )
        .writeLine("}")
        .writeLine("const results = {};")
        .blankLine()
        .writeLine("const calculateCount = (records, countQuery) => {")
        .indent(() => {
          writer
            .writeLine("const [key] = Object.keys(countQuery);")
            .writeLine("return records.filter(record => key in record && record[key] === countQuery[key]).length;");
        })
        .writeLine("};") // compute count
        .blankLine()
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
        .blankLine() // compute sum
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
        .blankLine() // compute min
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
        .blankLine() // compute max
        .writeLine("if (query._count) results._count = calculateCount(records, query._count);")
        .writeLine("if (query._sum) results._sum = calculateSum(records, query._sum);")
        .writeLine("if (query._min) results._min = calculateMin(records, query._min);")
        .writeLine("if (query._max) results._max = calculateMax(records, query._max);")
        .blankLine()
        .writeLine("return results as Prisma.Result<T, Q, 'aggregate'>;");
    },
  });
}

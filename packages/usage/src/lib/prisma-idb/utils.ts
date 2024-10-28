type RecordType = Record<string, unknown>;

export function intersectArraysByNestedKey<T extends RecordType>(
  arrays: T[][],
  keyPath: string[],
): T[] {
  return arrays.reduce((acc, array) =>
    acc.filter((item) =>
      array.some((el) => keyPath.every((key) => el[key] === item[key])),
    ),
  );
}

export function removeDuplicatesByKeyPath<T extends RecordType>(
  array: T[][],
  keyPath: string[],
): T[] {
  const seen = new Set<string>();
  return array
    .flatMap((el) => el)
    .filter((item) => {
      const key = JSON.stringify(keyPath.map((key) => item[key]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isLogicalOperator(param: string) {
  return param === "AND" || param === "OR" || param === "NOT";
}

export function filterByWhereClause(
  records: RecordType[],
  keyPath: string[],
  whereClause: undefined | RecordType,
): RecordType[] {
  if (whereClause === undefined) return records;

  for (const untypedParam in whereClause) {
    const param = untypedParam as keyof typeof whereClause;
    if (whereClause[param] === undefined) continue;

    if (isLogicalOperator(param)) {
      const operands = Array.isArray(whereClause[param])
        ? whereClause[param]
        : [whereClause[param]];

      if (param === "AND") {
        records = intersectArraysByNestedKey(
          operands.map((operandClause) =>
            filterByWhereClause(records, keyPath, operandClause),
          ),
          keyPath,
        );
      }

      if (param === "OR") {
        records = removeDuplicatesByKeyPath(
          operands.map((operandClause) =>
            filterByWhereClause(records, keyPath, operandClause),
          ),
          keyPath,
        );
      }

      if (param === "NOT") {
        const excludedRecords = removeDuplicatesByKeyPath(
          operands.map((operandClause) =>
            filterByWhereClause(records, keyPath, operandClause),
          ),
          keyPath,
        );
        records = records.filter(
          (item) =>
            !excludedRecords.some((excluded) =>
              keyPath.every((key) => excluded[key] === item[key]),
            ),
        );
      }
    }

    records = records.filter((record) => record[param] === whereClause[param]);
  }

  return records;
}

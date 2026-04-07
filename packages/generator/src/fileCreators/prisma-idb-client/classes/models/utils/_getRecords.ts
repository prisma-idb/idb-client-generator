import { DMMF } from "@prisma/generator-helper";
import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../types";
import { getForeignKeyIndexes, getNonUniqueIndexes } from "../../../../../helpers/utils";

/**
 * Generates the private `_getRecords` method on a model class.
 *
 * This method optimizes IndexedDB reads by selecting the best available index:
 *  1. **Full match** — all fields of a composite index have equality values → `IDBKeyRange.only()`
 *  2. **Prefix match** — leading fields of a composite index match → `IDBKeyRange.bound()`
 *  3. **Fallback** — no applicable index → plain `getAll()`
 *
 * Indexes tried include both user-defined `@@index` directives and auto-generated
 * foreign key indexes (used to speed up relation joins / `include` queries).
 * Indexes are tried most-selective-first (most fields). For models with no
 * applicable indexes the method simply delegates to `getAll()`.
 */
export function addGetRecords(writer: CodeBlockWriter, model: Model, datamodelIndexes: readonly DMMF.Index[]) {
  const nonUniqueIndexes = getNonUniqueIndexes(model, datamodelIndexes);
  const fkIndexes = getForeignKeyIndexes(model, datamodelIndexes);
  const allIndexes = [...nonUniqueIndexes, ...fkIndexes];

  writer
    .writeLine(`private async _getRecords(`)
    .writeLine(`tx: IDBUtils.TransactionType,`)
    .writeLine(`where?: Prisma.Args<Prisma.${model.name}Delegate, 'findFirstOrThrow'>['where'],`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[]>`)
    .block(() => {
      if (allIndexes.length === 0) {
        writer.writeLine(`return tx.objectStore("${model.name}").getAll();`);
        return;
      }

      writer.writeLine(`if (!where) return tx.objectStore("${model.name}").getAll();`);

      // Parse keyPaths once upfront
      const indexesWithFields = allIndexes.map((idx) => ({
        ...idx,
        fieldNames: JSON.parse(idx.keyPath) as string[],
      }));

      // Sort indexes by field count descending (most selective first)
      const sortedIndexes = [...indexesWithFields].sort((a, b) => b.fieldNames.length - a.fieldNames.length);

      // Collect all unique field names used across all indexes
      const allFieldNames = new Set<string>();
      for (const idx of sortedIndexes) {
        for (const f of idx.fieldNames) allFieldNames.add(f);
      }

      // Generate equality extraction for each indexed field
      for (const fieldName of allFieldNames) {
        const field = model.fields.find((f) => f.name === fieldName)!;
        if (field.type === "DateTime") {
          writer.writeLine(`let ${fieldName}Eq = IDBUtils.extractEqualityValue(where.${fieldName});`);
          writer.writeLine(`if (typeof ${fieldName}Eq === 'string') ${fieldName}Eq = new Date(${fieldName}Eq);`);
        } else {
          writer.writeLine(`const ${fieldName}Eq = IDBUtils.extractEqualityValue(where.${fieldName});`);
        }
      }
      writer.blankLine();

      // Phase 1: Full matches (all fields of an index have equality values)
      for (const idx of sortedIndexes) {
        const fields = idx.fieldNames;
        const condition = fields.map((f) => `${f}Eq !== undefined`).join(" && ");
        const keyArray = fields.map((f) => `${f}Eq`).join(", ");

        writer.writeLine(`if (${condition})`).block(() => {
          writer.writeLine(
            `return tx.objectStore("${model.name}").index("${idx.name}Index").getAll(IDBUtils.IDBKeyRange.only([${keyArray}]));`
          );
        });
      }
      writer.blankLine();

      // Phase 2: Prefix matches for composite indexes (try longer prefixes first)
      for (const idx of sortedIndexes) {
        const fields = idx.fieldNames;
        if (fields.length < 2) continue;

        for (let prefixLen = fields.length - 1; prefixLen >= 1; prefixLen--) {
          const prefixFields = fields.slice(0, prefixLen);
          const condition = prefixFields.map((f) => `${f}Eq !== undefined`).join(" && ");
          const lowerArray = prefixFields.map((f) => `${f}Eq`).join(", ");

          writer.writeLine(`if (${condition})`).block(() => {
            writer.writeLine(
              `return tx.objectStore("${model.name}").index("${idx.name}Index")` +
                `.getAll(IDBUtils.IDBKeyRange.bound([${lowerArray}], [${lowerArray}, []], false, true));`
            );
          });
        }
      }

      // Fallback
      writer.writeLine(`return tx.objectStore("${model.name}").getAll();`);
    });
}

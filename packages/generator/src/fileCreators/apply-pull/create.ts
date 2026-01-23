import CodeBlockWriter from "code-block-writer";
import { Model } from "../types";
import { getUniqueIdentifiers } from "../../helpers/utils";

export function createApplyPullFile(writer: CodeBlockWriter, models: Model[]) {
  // Write imports
  writer.writeLine(`import type { LogWithRecord } from '../server/batch-processor';`);
  writer.writeLine(`import { validators } from '../validators';`);
  writer.writeLine(`import type { PrismaIDBClient } from './prisma-idb-client';`);
  writer.writeLine(`import { z } from 'zod';`);
  writer.blankLine();

  // Write handlerMap
  writer.writeLine(`const handlerMap = `).block(() => {
    models.forEach((model, index) => {
      const modelName = model.name;
      const camelCaseName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
      const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];

      // Build where clause for update/delete
      const whereClause =
        pk.length === 1
          ? `{ ${pk[0]}: record.${pk[0]} }`
          : `{ ${pk.join("_")}: { ${pk.map((field) => `${field}: record.${field}`).join(", ")} } }`;

      writer.writeLine(`${modelName}: `).block(() => {
        writer.writeLine(`create: async (client: PrismaIDBClient, record: z.infer<typeof validators.${modelName}>) =>`);
        writer.writeLine(`	client.${camelCaseName}.create({ data: record }, { silent: true, addToOutbox: false }),`);

        writer.writeLine(`update: async (client: PrismaIDBClient, record: z.infer<typeof validators.${modelName}>) =>`);
        writer.writeLine(
          `	client.${camelCaseName}.update({ where: ${whereClause}, data: record }, { silent: true, addToOutbox: false }),`,
        );

        writer.writeLine(`delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.${modelName}>) =>`);
        writer.writeLine(
          `	client.${camelCaseName}.delete({ where: ${whereClause} }, { silent: true, addToOutbox: false })`,
        );
      });

      if (index < models.length - 1) {
        writer.write(",");
      }
    });
  });
  writer.write(";");
  writer.blankLine();

  // Write applyPull function
  writer.writeLine(`export async function applyPull(`);
  writer.writeLine(`	idbClient: PrismaIDBClient,`);
  writer.writeLine(`	logsWithRecords: LogWithRecord<typeof validators>[]`);
  writer.writeLine(`) `).block(() => {
    writer.writeLine(`let missingRecords = 0;`);
    writer.blankLine();

    writer.writeLine(`for (const change of logsWithRecords) `).block(() => {
      writer.writeLine(`const { model, operation, record } = change;`);
      writer.writeLine(`if (!record)`).block(() => {
        writer.writeLine(`missingRecords++;`);
        writer.writeLine(`continue;`);
      });
      writer.blankLine();

      models.forEach((model, index) => {
        const modelName = model.name;
        const condition = index === 0 ? "if" : "else if";

        writer.writeLine(`${condition} (model === '${modelName}') `).block(() => {
          writer.writeLine(`const validatedRecord = validators.${modelName}.parse(record);`);
          writer.writeLine(`const handler = handlerMap.${modelName}[operation];`);
          writer.writeLine(`await handler(idbClient, validatedRecord);`);
        });
      });
    });

    writer.blankLine();
    writer.writeLine(`return { missingRecords, totalAppliedRecords: logsWithRecords.length - missingRecords };`);
  });
}

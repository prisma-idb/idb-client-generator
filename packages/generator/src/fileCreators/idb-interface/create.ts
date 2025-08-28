import { DMMF } from "@prisma/generator-helper";
import { CodeBlockWriter } from "ts-morph";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";

export function createIDBInterfaceFile(writer: CodeBlockWriter, models: DMMF.Datamodel["models"]) {
  writer
    .writeLine(`import type { DBSchema } from 'idb';`)
    .writeLine(`import * as Prisma from '@prisma/client';`)
    .blankLine();

  writer.writeLine(`export interface PrismaIDBSchema extends DBSchema`).block(() => {
    models.forEach((model) => {
      writer.writeLine(`${model.name}:`).block(() => {
        writer.writeLine(`key: ${getUniqueIdentifiers(model)[0].keyPathType};`);
        writer.writeLine(`value: Prisma.${model.name};`);
        createUniqueFieldIndexes(writer, model);
      });
    });
  });
}

function createUniqueFieldIndexes(writer: CodeBlockWriter, model: Model) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);
  if (nonKeyUniqueIdentifiers.length === 0) return;

  writer.writeLine("indexes: ").block(() => {
    nonKeyUniqueIdentifiers.forEach(({ name, keyPathType }) => {
      writer.writeLine(`${name}Index: ${keyPathType}`);
    });
  });
}

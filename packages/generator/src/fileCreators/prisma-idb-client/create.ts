import { DMMF } from "@prisma/generator-helper";
import { CodeBlockWriter } from "ts-morph";
import type { Model } from "../types";
import { addBaseModelClass } from "./classes/BaseIDBModelClass";
import { addIDBModelClass } from "./classes/models/IDBModelClass";
import { addClientClass } from "./classes/PrismaIDBClient";

function addImports(writer: CodeBlockWriter, models: readonly Model[]) {
  writer
    .writeLine("/* eslint-disable @typescript-eslint/no-unused-vars */")
    .writeLine(`import { openDB } from "idb";`)
    .writeLine(`import type { IDBPDatabase, StoreNames, IDBPTransaction } from "idb";`)
    .writeLine(`import type { Prisma } from "@prisma/client";`)
    .writeLine(`import * as IDBUtils from "./idb-utils";`)
    .writeLine(`import type { PrismaIDBSchema } from "./idb-interface";`);

  const cuidFieldExists = models
    .flatMap((model) => model.fields)
    .some((field) => typeof field.default === "object" && "name" in field.default && field.default.name == "cuid");

  if (cuidFieldExists) writer.writeLine(`import { createId } from "@paralleldrive/cuid2";`);

  const uuidFieldExists = models
    .flatMap((model) => model.fields)
    .some((field) => typeof field.default === "object" && "name" in field.default && field.default.name == "uuid");

  if (uuidFieldExists) writer.writeLine(`import { v4 as uuidv4 } from "uuid";`);
}

function addVersionDeclaration(writer: CodeBlockWriter) {
  writer.writeLine(`const IDB_VERSION = 1;`);
}

export function createPrismaIDBClientFile(writer: CodeBlockWriter, models: DMMF.Datamodel["models"]) {
  addImports(writer, models);
  addVersionDeclaration(writer);
  addClientClass(writer, models);
  addBaseModelClass(writer);
  models.forEach((model) => {
    addIDBModelClass(writer, model, models);
  });
}

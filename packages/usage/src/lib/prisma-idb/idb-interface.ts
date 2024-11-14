import * as Prisma from "@prisma/client";
import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [userId: Prisma.User["userId"]];
    value: Prisma.User;
    indexes: {
      nameIndex: [name: Prisma.User["name"]];
    };
  };
  Todo: {
    key: [todoId: Prisma.Todo["todoId"]];
    value: Prisma.Todo;
  };
  UniqueUserModel: {
    key: [firstName: Prisma.UniqueUserModel["firstName"], lastName: Prisma.UniqueUserModel["lastName"]];
    value: Prisma.UniqueUserModel;
  };
  IDUserModel: {
    key: [firstName: Prisma.IDUserModel["firstName"], lastName: Prisma.IDUserModel["lastName"]];
    value: Prisma.IDUserModel;
  };
  UniqueAndIdFieldsModel: {
    key: [firstName: Prisma.UniqueAndIdFieldsModel["firstName"], lastName: Prisma.UniqueAndIdFieldsModel["lastName"]];
    value: Prisma.UniqueAndIdFieldsModel;
    indexes: {
      uniqueFieldIndex: [uniqueField: Prisma.UniqueAndIdFieldsModel["uniqueField"]];
      uniqueStringFieldIndex: [uniqueStringField: Prisma.UniqueAndIdFieldsModel["uniqueStringField"]];
      emailProvider_emailDomainIndex: [
        emailProvider: Prisma.UniqueAndIdFieldsModel["emailProvider"],
        emailDomain: Prisma.UniqueAndIdFieldsModel["emailDomain"],
      ];
      uniqueNameIndex: [
        firstName: Prisma.UniqueAndIdFieldsModel["firstName"],
        lastName: Prisma.UniqueAndIdFieldsModel["lastName"],
      ];
    };
  };
  OptionalFieldsModel: {
    key: [uuid: Prisma.OptionalFieldsModel["uuid"]];
    value: Prisma.OptionalFieldsModel;
  };
}

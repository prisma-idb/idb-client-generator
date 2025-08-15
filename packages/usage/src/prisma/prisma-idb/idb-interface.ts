import * as Prisma from "@prisma/client";
import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [id: Prisma.User["id"]];
    value: Prisma.User;
  };
  Group: {
    key: [id: Prisma.Group["id"]];
    value: Prisma.Group;
  };
  UserGroup: {
    key: [groupId: Prisma.UserGroup["groupId"], userId: Prisma.UserGroup["userId"]];
    value: Prisma.UserGroup;
  };
  Profile: {
    key: [id: Prisma.Profile["id"]];
    value: Prisma.Profile;
    indexes: {
      userIdIndex: [userId: Prisma.Profile["userId"]];
    };
  };
  Post: {
    key: [id: Prisma.Post["id"]];
    value: Prisma.Post;
  };
  Comment: {
    key: [id: Prisma.Comment["id"]];
    value: Prisma.Comment;
  };
  AllFieldScalarTypes: {
    key: [id: Prisma.AllFieldScalarTypes["id"]];
    value: Prisma.AllFieldScalarTypes;
  };
  Father: {
    key: [firstName: Prisma.Father["firstName"], lastName: Prisma.Father["lastName"]];
    value: Prisma.Father;
    indexes: {
      motherFirstName_motherLastNameIndex: [
        motherFirstName: Prisma.Father["motherFirstName"],
        motherLastName: Prisma.Father["motherLastName"],
      ];
    };
  };
  Mother: {
    key: [firstName: Prisma.Mother["firstName"], lastName: Prisma.Mother["lastName"]];
    value: Prisma.Mother;
  };
  Child: {
    key: [childFirstName: Prisma.Child["childFirstName"], childLastName: Prisma.Child["childLastName"]];
    value: Prisma.Child;
  };
  ModelWithEnum: {
    key: [id: Prisma.ModelWithEnum["id"]];
    value: Prisma.ModelWithEnum;
  };
  TestUuid: {
    key: [id: Prisma.TestUuid["id"]];
    value: Prisma.TestUuid;
  };
  ModelWithOptionalRelationToUniqueAttributes: {
    key: [id: Prisma.ModelWithOptionalRelationToUniqueAttributes["id"]];
    value: Prisma.ModelWithOptionalRelationToUniqueAttributes;
  };
  ModelWithUniqueAttributes: {
    key: [id: Prisma.ModelWithUniqueAttributes["id"]];
    value: Prisma.ModelWithUniqueAttributes;
    indexes: {
      codeIndex: [code: Prisma.ModelWithUniqueAttributes["code"]];
    };
  };
}

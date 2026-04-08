import type { DBSchema } from "idb";
import type * as Prisma from "../../generated/prisma/client";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [id: Prisma.User["id"]];
    value: Prisma.User;
  };
  Group: {
    key: [id: Prisma.Group["id"]];
    value: Prisma.Group;
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
    indexes: {
      authorIdIndex: [authorId: NonNullable<Prisma.Post["authorId"]>];
    };
  };
  Comment: {
    key: [id: Prisma.Comment["id"]];
    value: Prisma.Comment;
    indexes: {
      postIdIndex: [postId: Prisma.Comment["postId"]];
      userIdIndex: [userId: Prisma.Comment["userId"]];
    };
  };
  Todo: {
    key: [id: Prisma.Todo["id"]];
    value: Prisma.Todo;
    indexes: {
      userIdIndex: [userId: Prisma.Todo["userId"]];
    };
  };
  AllFieldScalarTypes: {
    key: [id: Prisma.AllFieldScalarTypes["id"]];
    value: Prisma.AllFieldScalarTypes;
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
    indexes: {
      linkIdIndex: [linkId: NonNullable<Prisma.ModelWithOptionalRelationToUniqueAttributes["linkId"]>];
    };
  };
  ModelWithUniqueAttributes: {
    key: [id: Prisma.ModelWithUniqueAttributes["id"]];
    value: Prisma.ModelWithUniqueAttributes;
    indexes: {
      codeIndex: [code: Prisma.ModelWithUniqueAttributes["code"]];
    };
  };
  UserGroup: {
    key: [groupId: Prisma.UserGroup["groupId"], userId: Prisma.UserGroup["userId"]];
    value: Prisma.UserGroup;
    indexes: {
      groupIdIndex: [groupId: Prisma.UserGroup["groupId"]];
      userIdIndex: [userId: Prisma.UserGroup["userId"]];
    };
  };
  Father: {
    key: [firstName: Prisma.Father["firstName"], lastName: Prisma.Father["lastName"]];
    value: Prisma.Father;
    indexes: {
      motherFirstName_motherLastNameIndex: [
        motherFirstName: Prisma.Father["motherFirstName"],
        motherLastName: Prisma.Father["motherLastName"],
      ];
      userIdIndex: [userId: NonNullable<Prisma.Father["userId"]>];
    };
  };
  Mother: {
    key: [firstName: Prisma.Mother["firstName"], lastName: Prisma.Mother["lastName"]];
    value: Prisma.Mother;
    indexes: {
      userIdIndex: [userId: NonNullable<Prisma.Mother["userId"]>];
    };
  };
  Child: {
    key: [childFirstName: Prisma.Child["childFirstName"], childLastName: Prisma.Child["childLastName"]];
    value: Prisma.Child;
    indexes: {
      userIdIndex: [userId: NonNullable<Prisma.Child["userId"]>];
      fatherLastName_fatherFirstNameIndex: [
        fatherLastName: Prisma.Child["fatherLastName"],
        fatherFirstName: Prisma.Child["fatherFirstName"],
      ];
      motherFirstName_motherLastNameIndex: [
        motherFirstName: Prisma.Child["motherFirstName"],
        motherLastName: Prisma.Child["motherLastName"],
      ];
    };
  };
  CompositeIdIntString: {
    key: [orgId: Prisma.CompositeIdIntString["orgId"], code: Prisma.CompositeIdIntString["code"]];
    value: Prisma.CompositeIdIntString;
  };
  CompositeIdWithDateTime: {
    key: [tenantId: Prisma.CompositeIdWithDateTime["tenantId"], createdAt: Prisma.CompositeIdWithDateTime["createdAt"]];
    value: Prisma.CompositeIdWithDateTime;
  };
  TripleCompositeIdWithDate: {
    key: [
      region: Prisma.TripleCompositeIdWithDate["region"],
      year: Prisma.TripleCompositeIdWithDate["year"],
      eventDate: Prisma.TripleCompositeIdWithDate["eventDate"],
    ];
    value: Prisma.TripleCompositeIdWithDate;
  };
  CompositeUniqueWithDateTime: {
    key: [id: Prisma.CompositeUniqueWithDateTime["id"]];
    value: Prisma.CompositeUniqueWithDateTime;
    indexes: {
      category_timestampIndex: [
        category: Prisma.CompositeUniqueWithDateTime["category"],
        timestamp: Prisma.CompositeUniqueWithDateTime["timestamp"],
      ];
    };
  };
  CompositeUniqueFloatInt: {
    key: [id: Prisma.CompositeUniqueFloatInt["id"]];
    value: Prisma.CompositeUniqueFloatInt;
    indexes: {
      lat_lngIndex: [lat: Prisma.CompositeUniqueFloatInt["lat"], lng: Prisma.CompositeUniqueFloatInt["lng"]];
      zoneId_latIndex: [zoneId: Prisma.CompositeUniqueFloatInt["zoneId"], lat: Prisma.CompositeUniqueFloatInt["lat"]];
    };
  };
  MultipleCompositeUniques: {
    key: [id: Prisma.MultipleCompositeUniques["id"]];
    value: Prisma.MultipleCompositeUniques;
    indexes: {
      a_bIndex: [a: Prisma.MultipleCompositeUniques["a"], b: Prisma.MultipleCompositeUniques["b"]];
      c_dIndex: [c: Prisma.MultipleCompositeUniques["c"], d: Prisma.MultipleCompositeUniques["d"]];
      a_cIndex: [a: Prisma.MultipleCompositeUniques["a"], c: Prisma.MultipleCompositeUniques["c"]];
    };
  };
  ModelWithIndex: {
    key: [id: Prisma.ModelWithIndex["id"]];
    value: Prisma.ModelWithIndex;
    indexes: {
      category_priorityIndex: [
        category: Prisma.ModelWithIndex["category"],
        priority: Prisma.ModelWithIndex["priority"],
      ];
      dateIndex: [date: Prisma.ModelWithIndex["date"]];
    };
  };
}

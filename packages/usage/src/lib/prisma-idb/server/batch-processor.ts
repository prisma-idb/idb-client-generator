import type { StoreNames } from "idb";
import { z, type ZodTypeAny } from "zod";
import type { OutboxEventRecord, PrismaIDBSchema } from "../client/idb-interface";
import {
  UserSchema,
  GroupSchema,
  UserGroupSchema,
  ProfileSchema,
  PostSchema,
  CommentSchema,
  AllFieldScalarTypesSchema,
  FatherSchema,
  MotherSchema,
  ChildSchema,
  ModelWithEnumSchema,
  TestUuidSchema,
  ModelWithOptionalRelationToUniqueAttributesSchema,
  ModelWithUniqueAttributesSchema,
  TodoSchema,
} from "$lib/generated/prisma-zod-generator/schemas/models";

type Op = "create" | "update" | "delete";

type EventsFor<V extends Partial<Record<string, ZodTypeAny>>> = {
  [M in keyof V & string]: {
    [O in Op]: {
      entityType: M;
      operation: O;
      payload: z.infer<V[M]>;
    };
  }[Op];
}[keyof V & string];

const validators = {
  User: UserSchema,
  Group: GroupSchema,
  UserGroup: UserGroupSchema,
  Profile: ProfileSchema,
  Post: PostSchema,
  Comment: CommentSchema,
  AllFieldScalarTypes: AllFieldScalarTypesSchema,
  Father: FatherSchema,
  Mother: MotherSchema,
  Child: ChildSchema,
  ModelWithEnum: ModelWithEnumSchema,
  TestUuid: TestUuidSchema,
  ModelWithOptionalRelationToUniqueAttributes: ModelWithOptionalRelationToUniqueAttributesSchema,
  ModelWithUniqueAttributes: ModelWithUniqueAttributesSchema,
  Todo: TodoSchema,
} as const;

const allModels = new Set<string>([
  "User",
  "Group",
  "UserGroup",
  "Profile",
  "Post",
  "Comment",
  "AllFieldScalarTypes",
  "Father",
  "Mother",
  "Child",
  "ModelWithEnum",
  "TestUuid",
  "ModelWithOptionalRelationToUniqueAttributes",
  "ModelWithUniqueAttributes",
  "Todo",
]);

export function processBatch(
  batch: OutboxEventRecord[],
  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>,
) {
  return batch.map((event) => {
    if (!allModels.has(event.entityType)) {
      throw new Error(`Unknown entity type: ${event.entityType}`);
    }

    const modelName = event.entityType as StoreNames<PrismaIDBSchema>;
    const validator = validators[modelName as keyof typeof validators];
    if (!validator) throw new Error(`No validator for model ${modelName}`);

    const result = validator.safeParse(event.payload);
    if (!result.success) throw new Error(`Validation failed: ${result.error.message}`);

    if (customValidation) {
      const ok = customValidation(event as unknown as EventsFor<typeof validators>);
      if (ok instanceof Promise) {
        throw new Error("async customValidation used but processBatch is sync");
      }
      if (!ok) throw new Error("custom validation failed");
    }

    return event;
  });
}

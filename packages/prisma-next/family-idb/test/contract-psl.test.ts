import { parsePslDocument } from "@prisma-next/psl-parser";
import { UNBOUND_DOMAIN_NAMESPACE_ID } from "@prisma-next/contract/types";
import { describe, expect, it } from "vitest";
import { interpretPslDocumentToIdbContract } from "../src/core/psl-interpreter";

function parse(schema: string) {
  return parsePslDocument({ schema, sourceId: "test.prisma" });
}

function interpret(schema: string) {
  const { ast } = parse(schema);
  return interpretPslDocumentToIdbContract(ast, "test.prisma");
}

const NS = UNBOUND_DOMAIN_NAMESPACE_ID;

type TestContractField = {
  readonly nullable: boolean;
  readonly type: {
    readonly kind: string;
    readonly codecId: string;
  };
};

type TestContractModel = {
  readonly fields: Record<string, TestContractField>;
  readonly relations: Record<string, unknown>;
  readonly storage: {
    readonly relations: Record<string, unknown>;
  };
};

describe("interpretPslDocumentToIdbContract", () => {
  describe("basic contract shape", () => {
    it("produces a valid IDB contract for a single model", () => {
      const result = interpret(`
        model User {
          id    String  @id
          name  String
          email String?
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const contract = result.value;
      expect(contract.target).toBe("idb");
      expect(contract.targetFamily).toBe("idb");
      expect(contract.storage.stores).toHaveProperty("user");
      expect(contract.storage.stores["user"]).toMatchObject({ keyPath: "id" });
      expect(contract.roots).toHaveProperty("user");
      expect(contract.domain.namespaces[NS]!.models).toHaveProperty("User");
    });

    it("derives store name from @@map", () => {
      const result = interpret(`
        model User {
          id   String @id
          name String
          @@map("users")
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.storage.stores).toHaveProperty("users");
      expect(result.value.roots).toHaveProperty("users");
    });

    it("defaults store name to lowerFirst(modelName)", () => {
      const result = interpret(`
        model BlogPost {
          id    String @id
          title String
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.storage.stores).toHaveProperty("blogPost");
    });

    it("builds correct ContractField entries", () => {
      const result = interpret(`
        model Item {
          id        String   @id
          name      String
          price     Float?
          createdAt DateTime
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const model = result.value.domain.namespaces[NS]!.models["Item"] as unknown as TestContractModel;
      expect(model.fields["name"]).toMatchObject({
        nullable: false,
        type: { kind: "scalar", codecId: "idb/string@1" },
      });
      expect(model.fields["price"]).toMatchObject({
        nullable: true,
        type: { kind: "scalar", codecId: "idb/double@1" },
      });
      expect(model.fields["createdAt"]).toMatchObject({
        nullable: false,
        type: { kind: "scalar", codecId: "idb/date@1" },
      });
    });

    it("emits profileHash and storageHash", () => {
      const result = interpret(`model T { id String @id }`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(typeof result.value.storage.storageHash).toBe("string");
      expect(typeof result.value.profileHash).toBe("string");
    });
  });

  describe("@@id model-level attribute", () => {
    it("accepts @@id([field]) as equivalent to @id", () => {
      const result = interpret(`
        model Post {
          id    String
          title String
          @@id([id])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.storage.stores["post"]).toMatchObject({ keyPath: "id" });
    });

    it("errors on compound @@id", () => {
      const result = interpret(`
        model Post {
          a String
          b String
          @@id([a, b])
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_NO_COMPOUND_KEY");
    });

    it("errors when both @id and @@id are used", () => {
      const result = interpret(`
        model Post {
          id String @id
          @@id([id])
        }
      `);
      expect(result.ok).toBe(false);
    });
  });

  describe("indexes", () => {
    it("creates IDB index from @@index", () => {
      const result = interpret(`
        model User {
          id    String @id
          email String
          @@index([email])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const store = result.value.storage.stores["user"]!;
      expect(store.indexes).toHaveProperty("email");
      expect(store.indexes!["email"]).toMatchObject({ keyPath: "email", unique: false });
    });

    it("creates unique IDB index from @@unique", () => {
      const result = interpret(`
        model User {
          id    String @id
          email String
          @@unique([email])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const store = result.value.storage.stores["user"]!;
      expect(store.indexes).toHaveProperty("email_unique");
      expect(store.indexes!["email_unique"]).toMatchObject({ keyPath: "email", unique: true });
    });

    it("uses name: arg as the index map key", () => {
      const result = interpret(`
        model User {
          id    String @id
          email String
          @@index([email], name: "byEmail")
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const store = result.value.storage.stores["user"]!;
      expect(store.indexes).toHaveProperty("byEmail");
    });

    it("creates unique index from @unique field attribute", () => {
      const result = interpret(`
        model User {
          id    String @id
          email String @unique
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const store = result.value.storage.stores["user"]!;
      expect(store.indexes).toHaveProperty("email_unique");
      expect(store.indexes!["email_unique"]).toMatchObject({ unique: true });
    });

    it("errors on compound index", () => {
      const result = interpret(`
        model User {
          id    String @id
          first String
          last  String
          @@index([first, last])
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_COMPOUND_INDEX_UNSUPPORTED");
    });
  });

  describe("relations", () => {
    it("builds N:1 and 1:N relations between two models", () => {
      const result = interpret(`
        model User {
          id    String @id
          name  String
          posts Post[]
        }

        model Post {
          id     String @id
          title  String
          userId String
          user   User   @relation(fields: [userId], references: [id])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const userModel = result.value.domain.namespaces[NS]!.models["User"] as unknown as TestContractModel;
      const postModel = result.value.domain.namespaces[NS]!.models["Post"] as unknown as TestContractModel;

      // Post has N:1 (user) → points to User
      expect(postModel.relations["user"]).toMatchObject({
        cardinality: "N:1",
        on: { localFields: ["userId"], targetFields: ["id"] },
      });

      // User has 1:N (posts) → points to Post
      expect(userModel.relations["posts"]).toMatchObject({
        cardinality: "1:N",
        on: { localFields: ["id"], targetFields: ["userId"] },
      });
    });

    it("stores onDelete in IdbModelStorage.relations", () => {
      const result = interpret(`
        model User {
          id    String @id
          posts Post[]
        }
        model Post {
          id     String @id
          userId String
          user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const postModel = result.value.domain.namespaces[NS]!.models["Post"] as unknown as TestContractModel;
      expect(postModel.storage.relations["user"]).toMatchObject({ onDelete: "cascade" });
    });

    it("automatically creates an index on the FK field", () => {
      const result = interpret(`
        model User {
          id    String @id
          posts Post[]
        }
        model Post {
          id     String @id
          userId String
          user   User   @relation(fields: [userId], references: [id])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const postStore = result.value.storage.stores["post"]!;
      expect(postStore.indexes).toHaveProperty("userId");
    });

    it("errors on missing @relation attribute", () => {
      const result = interpret(`
        model User {
          id   String @id
          post Post
        }
        model Post {
          id String @id
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_MISSING_RELATION_ATTRIBUTE");
    });

    it("errors when backrelation has no matching FK", () => {
      const result = interpret(`
        model User {
          id    String @id
          posts Post[]
        }
        model Post {
          id    String @id
          title String
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_UNRESOLVED_BACKRELATION");
    });
  });

  describe("error cases", () => {
    it("errors when no @id is declared", () => {
      const result = interpret(`
        model User {
          id   String
          name String
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_MISSING_ID");
    });

    it("errors on namespace blocks", () => {
      const result = interpret(`
        namespace auth {
          model User { id String @id }
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_UNSUPPORTED_NAMESPACE_BLOCK");
    });

    it("errors on unsupported scalar types", () => {
      const result = interpret(`
        model User {
          id   String @id
          data Unknown
        }
      `);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.diagnostics[0]!.code).toBe("IDB_UNSUPPORTED_FIELD_TYPE");
    });

    it("handles multiple models correctly", () => {
      const result = interpret(`
        model Category {
          id   String @id
          name String
          posts Post[]
        }
        model Post {
          id         String   @id
          title      String
          categoryId String
          category   Category @relation(fields: [categoryId], references: [id])
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value.storage.stores)).toEqual(expect.arrayContaining(["category", "post"]));
    });
  });

  describe("all Prisma scalar types", () => {
    it("maps all supported scalar types to correct codec IDs", () => {
      const result = interpret(`
        model Types {
          id        String   @id
          str       String
          int       Int
          float     Float
          bool      Boolean
          date      DateTime
          bigint    BigInt
          decimal   Decimal
          json      Json
          bytes     Bytes
        }
      `);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const model = result.value.domain.namespaces[NS]!.models["Types"] as unknown as TestContractModel;
      expect(model.fields["str"]?.type.codecId).toBe("idb/string@1");
      expect(model.fields["int"]?.type.codecId).toBe("idb/int32@1");
      expect(model.fields["float"]?.type.codecId).toBe("idb/double@1");
      expect(model.fields["bool"]?.type.codecId).toBe("idb/bool@1");
      expect(model.fields["date"]?.type.codecId).toBe("idb/date@1");
      expect(model.fields["bigint"]?.type.codecId).toBe("idb/bigint@1");
      expect(model.fields["decimal"]?.type.codecId).toBe("idb/decimal@1");
      expect(model.fields["json"]?.type.codecId).toBe("idb/json@1");
      expect(model.fields["bytes"]?.type.codecId).toBe("idb/bytes@1");
    });
  });
});

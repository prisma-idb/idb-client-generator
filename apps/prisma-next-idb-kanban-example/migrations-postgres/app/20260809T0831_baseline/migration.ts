#!/usr/bin/env -S node
import type { Contract as End } from "./end-contract";
import endContract from "./end-contract.json" with { type: "json" };
import { col, fn, Migration, MigrationCLI, primaryKey, unique } from "@prisma-next/postgres/migration";

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: "public",
        table: "user",
        columns: [
          col("id", "text", { notNull: true }),
          col("name", "text", { notNull: true }),
          col("email", "text"),
          col("passwordHash", "text", { notNull: true }),
        ],
        constraints: [primaryKey(["id"]), unique(["email"], { name: "user_email_key" })],
      }),
      this.createTable({
        schema: "public",
        table: "board",
        columns: [
          col("id", "text", { notNull: true }),
          col("name", "text", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true }),
          col("userId", "text", { notNull: true }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "todo",
        columns: [
          col("id", "text", { notNull: true }),
          col("title", "text", { notNull: true }),
          col("description", "text"),
          col("isCompleted", "bool", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true }),
          col("boardId", "text", { notNull: true }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "auditLog",
        columns: [
          col("id", "text", { notNull: true }),
          col("action", "text", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true }),
        ],
        constraints: [primaryKey(["id"])],
      }),
      this.createTable({
        schema: "public",
        table: "changelog",
        columns: [
          col("id", "int4", { notNull: true, default: fn("autoincrement()") }),
          col("model", "text", { notNull: true }),
          col("keyPath", "text", { notNull: true }),
          col("operation", "text", { notNull: true }),
          col("scopeKey", "text", { notNull: true }),
          col("outboxEventId", "text", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true, default: fn("now()") }),
        ],
        constraints: [primaryKey(["id"]), unique(["outboxEventId"], { name: "changelog_outboxEventId_key" })],
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "changelog",
        constraint: "changelog_operation_check",
        column: "operation",
        values: ["create", "update", "delete"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "board",
        foreignKey: {
          name: "board_userId_fkey",
          columns: ["userId"],
          references: { schema: "public", table: "user", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.createIndex({
        schema: "public",
        table: "board",
        index: "board_userId_idx",
        columns: ["userId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "todo",
        foreignKey: {
          name: "todo_boardId_fkey",
          columns: ["boardId"],
          references: { schema: "public", table: "board", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.createIndex({
        schema: "public",
        table: "todo",
        index: "todo_boardId_idx",
        columns: ["boardId"],
      }),
      this.createIndex({
        schema: "public",
        table: "changelog",
        index: "changelog_scopeKey_id_idx",
        columns: ["scopeKey", "id"],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

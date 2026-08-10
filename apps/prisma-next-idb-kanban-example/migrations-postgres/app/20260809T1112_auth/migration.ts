#!/usr/bin/env -S node
import type { Contract as End } from "./end-contract";
import endContract from "./end-contract.json" with { type: "json" };
import type { Contract as Start } from "./start-contract";
import startContract from "./start-contract.json" with { type: "json" };
import { col, fn, lit, Migration, MigrationCLI, primaryKey, unique } from "@prisma-next/postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Replaces the ad-hoc `passwordHash` stand-in with better-auth's real
      // User shape (see schema.prisma's User model doc comment).
      this.dropColumn({ schema: "public", table: "user", column: "passwordHash" }),
      this.addColumn({
        schema: "public",
        table: "user",
        column: col("emailVerified", "bool", { notNull: true, default: lit(false) }),
      }),
      this.addColumn({ schema: "public", table: "user", column: col("image", "text") }),
      this.addColumn({
        schema: "public",
        table: "user",
        column: col("createdAt", "timestamptz", { notNull: true, default: fn("now()") }),
      }),
      this.addColumn({
        schema: "public",
        table: "user",
        column: col("updatedAt", "timestamptz", { notNull: true }),
      }),
      this.addColumn({
        schema: "public",
        table: "user",
        column: col("isAnonymous", "bool", { notNull: true, default: lit(false) }),
      }),
      // `email` was created nullable by the baseline migration — better-auth
      // requires it (the anonymous() plugin always synthesizes a placeholder
      // address rather than leaving it unset). Safe as a plain SET NOT NULL
      // with no backfill: this table is created empty earlier in this same
      // migration chain, so no existing rows can violate it.
      this.setNotNull({ schema: "public", table: "user", column: "email" }),

      this.createTable({
        schema: "public",
        table: "session",
        columns: [
          col("id", "text", { notNull: true }),
          col("expiresAt", "timestamptz", { notNull: true }),
          col("token", "text", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true, default: fn("now()") }),
          col("updatedAt", "timestamptz", { notNull: true }),
          col("ipAddress", "text"),
          col("userAgent", "text"),
          col("userId", "text", { notNull: true }),
        ],
        constraints: [primaryKey(["id"]), unique(["token"], { name: "session_token_key" })],
      }),
      this.createTable({
        schema: "public",
        table: "account",
        columns: [
          col("id", "text", { notNull: true }),
          col("accountId", "text", { notNull: true }),
          col("providerId", "text", { notNull: true }),
          col("userId", "text", { notNull: true }),
          col("accessToken", "text"),
          col("refreshToken", "text"),
          col("idToken", "text"),
          col("accessTokenExpiresAt", "timestamptz"),
          col("refreshTokenExpiresAt", "timestamptz"),
          col("scope", "text"),
          col("password", "text"),
          col("createdAt", "timestamptz", { notNull: true, default: fn("now()") }),
          col("updatedAt", "timestamptz", { notNull: true }),
        ],
        // better-auth resolves a social account by this pair — without it,
        // two concurrent OAuth callbacks for the same provider account could
        // insert two rows and make later lookups non-deterministic.
        constraints: [
          primaryKey(["id"]),
          unique(["providerId", "accountId"], { name: "account_providerId_accountId_key" }),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "verification",
        columns: [
          col("id", "text", { notNull: true }),
          col("identifier", "text", { notNull: true }),
          col("value", "text", { notNull: true }),
          col("expiresAt", "timestamptz", { notNull: true }),
          col("createdAt", "timestamptz", { notNull: true, default: fn("now()") }),
          col("updatedAt", "timestamptz", { notNull: true }),
        ],
        constraints: [primaryKey(["id"])],
      }),

      this.addForeignKey({
        schema: "public",
        table: "session",
        foreignKey: {
          name: "session_userId_fkey",
          columns: ["userId"],
          references: { schema: "public", table: "user", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.createIndex({ schema: "public", table: "session", index: "session_userId_idx", columns: ["userId"] }),
      this.addForeignKey({
        schema: "public",
        table: "account",
        foreignKey: {
          name: "account_userId_fkey",
          columns: ["userId"],
          references: { schema: "public", table: "user", columns: ["id"] },
          onDelete: "cascade",
        },
      }),
      this.createIndex({ schema: "public", table: "account", index: "account_userId_idx", columns: ["userId"] }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);

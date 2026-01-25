import { z, type ZodTypeAny } from "zod";
import type { OutboxEventRecord } from "../client/idb-interface";
import type { ChangeLog } from "../../prisma/client";
import type { PrismaClient } from "../../prisma/client";
import { validators, keyPathValidators } from "../validators";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

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

export type LogWithRecord<V extends Partial<Record<string, ZodTypeAny>>> = {
  [M in keyof V & string]: Omit<ChangeLog, "model" | "keyPath"> & {
    model: M;
    keyPath: Array<string | number>;
    record?: z.infer<V[M]> | null;
  };
}[keyof V & string];

export const PushErrorTypes = {
  INVALID_MODEL: "INVALID_MODEL",
  RECORD_VALIDATION_FAILURE: "RECORD_VALIDATION_FAILURE",
  KEYPATH_VALIDATION_FAILURE: "KEYPATH_VALIDATION_FAILURE",
  MISSING_PARENT: "MISSING_PARENT",
  SCOPE_VIOLATION: "SCOPE_VIOLATION",
  UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  MAX_RETRIES: "MAX_RETRIES",
};

export interface PushResult {
  id: string;
  oldKeyPath?: Array<string | number>;
  entityKeyPath: Array<string | number>;
  mergedRecord?: unknown;
  error: null | {
    type: keyof typeof PushErrorTypes;
    message: string;
    retryable: boolean;
  };
}

export interface ApplyPushOptions {
  events: OutboxEventRecord[];
  scopeKey: string | ((event: OutboxEventRecord) => string);
  prisma: PrismaClient;
  originId: string;
  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>;
}

export class PermanentSyncError extends Error {
  readonly type: keyof typeof PushErrorTypes;
  constructor(type: keyof typeof PushErrorTypes, message: string) {
    super(message);
    this.type = type;
    Object.setPrototypeOf(this, PermanentSyncError.prototype);
  }
}

export async function applyPush({
  events,
  scopeKey,
  prisma,
  originId,
  customValidation,
}: ApplyPushOptions): Promise<PushResult[]> {
  const results: PushResult[] = [];
  for (const event of events) {
    try {
      const resolvedScopeKey = typeof scopeKey === "function" ? scopeKey(event) : scopeKey;
      let result: PushResult;
      switch (event.entityType) {
        case "Board": {
          {
            const validation = validators.Board.safeParse(event.payload);
            if (!validation.success)
              throw new PermanentSyncError(
                "RECORD_VALIDATION_FAILURE",
                `Validation failed for model Board: ${validation.error.message}`
              );

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncBoard(event, validation.data, resolvedScopeKey, prisma, originId);
            break;
          }
        }
        case "Todo": {
          {
            const validation = validators.Todo.safeParse(event.payload);
            if (!validation.success)
              throw new PermanentSyncError(
                "RECORD_VALIDATION_FAILURE",
                `Validation failed for model Todo: ${validation.error.message}`
              );

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncTodo(event, validation.data, resolvedScopeKey, prisma, originId);
            break;
          }
        }
        case "User": {
          {
            const validation = validators.User.safeParse(event.payload);
            if (!validation.success)
              throw new PermanentSyncError(
                "RECORD_VALIDATION_FAILURE",
                `Validation failed for model User: ${validation.error.message}`
              );

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncUser(event, validation.data, resolvedScopeKey, prisma, originId);
            break;
          }
        }
        default:
          throw new PermanentSyncError("INVALID_MODEL", `No sync handler for model ${event.entityType}`);
      }
      results.push(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const isPermanent = err instanceof PermanentSyncError;
      results.push({
        id: event.id,
        entityKeyPath: event.entityKeyPath,
        error: {
          type: isPermanent ? err.type : "UNKNOWN_ERROR",
          message: errorMessage,
          retryable: !isPermanent,
        },
      });
    }
  }
  return results;
}

export async function materializeLogs({
  logs,
  prisma,
}: {
  logs: Array<ChangeLog>;
  prisma: PrismaClient;
}): Promise<Array<LogWithRecord<typeof validators>>> {
  const validModelNames = ["Board", "Todo", "User"];
  const results: Array<LogWithRecord<typeof validators>> = [];
  for (const log of logs) {
    if (!validModelNames.includes(log.model)) {
      throw new Error(`Unknown model: ${log.model}`);
    }
    switch (log.model) {
      case "Board": {
        const keyPathValidation = keyPathValidators.Board.safeParse(log.keyPath);
        if (!keyPathValidation.success) {
          throw new Error("Invalid keyPath for Board");
        }
        const validKeyPath = keyPathValidation.data;
        const record = await prisma.board.findUnique({
          where: { id: validKeyPath[0] },
        });
        results.push({ ...log, model: "Board", keyPath: validKeyPath, record });
        break;
      }
      case "Todo": {
        const keyPathValidation = keyPathValidators.Todo.safeParse(log.keyPath);
        if (!keyPathValidation.success) {
          throw new Error("Invalid keyPath for Todo");
        }
        const validKeyPath = keyPathValidation.data;
        const record = await prisma.todo.findUnique({
          where: { id: validKeyPath[0] },
        });
        results.push({ ...log, model: "Todo", keyPath: validKeyPath, record });
        break;
      }
      case "User": {
        const keyPathValidation = keyPathValidators.User.safeParse(log.keyPath);
        if (!keyPathValidation.success) {
          throw new Error("Invalid keyPath for User");
        }
        const validKeyPath = keyPathValidation.data;
        const record = await prisma.user.findUnique({
          where: { id: validKeyPath[0] },
        });
        results.push({ ...log, model: "User", keyPath: validKeyPath, record });
        break;
      }
    }
  }
  return results;
}

async function syncBoard(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.Board>,
  scopeKey: string,
  prisma: PrismaClient,
  originId: string
): Promise<PushResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.Board.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new PermanentSyncError("KEYPATH_VALIDATION_FAILURE", "Invalid entityKeyPath for Board");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.Board>) => {
    const record = await prisma.board.findUnique({
      where: { id: keyPathArg[0] },
      select: { user: { select: { id: true } } },
    });

    if (!record || record.user.id !== scopeKey) {
      throw new PermanentSyncError("SCOPE_VIOLATION", `Unauthorized: Board is not owned by the authenticated scope`);
    }
  };

  switch (operation) {
    case "create": {
      const parentRecord = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true },
      });

      if (!parentRecord || parentRecord.id !== scopeKey) {
        throw new PermanentSyncError(
          "SCOPE_VIOLATION",
          `Unauthorized: Board parent is not owned by authenticated scope`
        );
      }
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Board",
              keyPath: validKeyPath,
              operation: "create",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const createdRecord = await tx.board.create({ data });
        const newKeyPath = [createdRecord.id];
        return { id, entityKeyPath: newKeyPath, mergedRecord: createdRecord, error: null };
      });
      return result;
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Board",
              keyPath: validKeyPath,
              oldKeyPath,
              operation: "update",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, oldKeyPath, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const updatedRecord = await tx.board.upsert({
          where: { id: validKeyPath[0] },
          create: data,
          update: data,
        });
        const newKeyPath = [updatedRecord.id];
        return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: updatedRecord, error: null };
      });
      return result;
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Board",
              keyPath: validKeyPath,
              operation: "delete",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, error: null };
          }
          throw err;
        }
        await tx.board.deleteMany({
          where: { id: validKeyPath[0] },
        });
        return { id, entityKeyPath: validKeyPath, error: null };
      });
      return result;
    }

    default:
      throw new PermanentSyncError("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  }
}

async function syncTodo(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.Todo>,
  scopeKey: string,
  prisma: PrismaClient,
  originId: string
): Promise<PushResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.Todo.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new PermanentSyncError("KEYPATH_VALIDATION_FAILURE", "Invalid entityKeyPath for Todo");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.Todo>) => {
    const record = await prisma.todo.findUnique({
      where: { id: keyPathArg[0] },
      select: { board: { select: { user: { select: { id: true } } } } },
    });

    if (!record || record.board.user.id !== scopeKey) {
      throw new PermanentSyncError("SCOPE_VIOLATION", `Unauthorized: Todo is not owned by the authenticated scope`);
    }
  };

  switch (operation) {
    case "create": {
      const parentRecord = await prisma.board.findUnique({
        where: { id: data.boardId },
        select: { user: { select: { id: true } } },
      });

      if (!parentRecord || parentRecord.user.id !== scopeKey) {
        throw new PermanentSyncError(
          "SCOPE_VIOLATION",
          `Unauthorized: Todo parent is not owned by authenticated scope`
        );
      }
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Todo",
              keyPath: validKeyPath,
              operation: "create",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const createdRecord = await tx.todo.create({ data });
        const newKeyPath = [createdRecord.id];
        return { id, entityKeyPath: newKeyPath, mergedRecord: createdRecord, error: null };
      });
      return result;
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Todo",
              keyPath: validKeyPath,
              oldKeyPath,
              operation: "update",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, oldKeyPath, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const updatedRecord = await tx.todo.upsert({
          where: { id: validKeyPath[0] },
          create: data,
          update: data,
        });
        const newKeyPath = [updatedRecord.id];
        return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: updatedRecord, error: null };
      });
      return result;
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "Todo",
              keyPath: validKeyPath,
              operation: "delete",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, error: null };
          }
          throw err;
        }
        await tx.todo.deleteMany({
          where: { id: validKeyPath[0] },
        });
        return { id, entityKeyPath: validKeyPath, error: null };
      });
      return result;
    }

    default:
      throw new PermanentSyncError("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  }
}

async function syncUser(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.User>,
  scopeKey: string,
  prisma: PrismaClient,
  originId: string
): Promise<PushResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.User.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new PermanentSyncError("KEYPATH_VALIDATION_FAILURE", "Invalid entityKeyPath for User");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.User>) => {
    if (keyPathArg[0] !== scopeKey) {
      throw new PermanentSyncError("SCOPE_VIOLATION", `Unauthorized: User pk does not match authenticated scope`);
    }
  };

  switch (operation) {
    case "create": {
      if (scopeKey !== data.id) {
        throw new PermanentSyncError("SCOPE_VIOLATION", `Unauthorized: root model pk must match authenticated scope`);
      }
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "User",
              keyPath: validKeyPath,
              operation: "create",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const createdRecord = await tx.user.create({ data });
        const newKeyPath = [createdRecord.id];
        return { id, entityKeyPath: newKeyPath, mergedRecord: createdRecord, error: null };
      });
      return result;
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "User",
              keyPath: validKeyPath,
              oldKeyPath,
              operation: "update",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, oldKeyPath, entityKeyPath: validKeyPath, mergedRecord: data, error: null };
          }
          throw err;
        }
        const updatedRecord = await tx.user.upsert({
          where: { id: validKeyPath[0] },
          create: data,
          update: data,
        });
        const newKeyPath = [updatedRecord.id];
        return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: updatedRecord, error: null };
      });
      return result;
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      const result = await prisma.$transaction(async (tx) => {
        try {
          await tx.changeLog.create({
            data: {
              model: "User",
              keyPath: validKeyPath,
              operation: "delete",
              scopeKey,
              originId,
              outboxEventId: event.id,
            },
          });
        } catch (err) {
          if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
            return { id, entityKeyPath: validKeyPath, error: null };
          }
          throw err;
        }
        await tx.user.deleteMany({
          where: { id: validKeyPath[0] },
        });
        return { id, entityKeyPath: validKeyPath, error: null };
      });
      return result;
    }

    default:
      throw new PermanentSyncError("UNKNOWN_OPERATION", `Unknown operation: ${operation}`);
  }
}

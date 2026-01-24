import { z, type ZodTypeAny } from "zod";
import type { OutboxEventRecord } from "../client/idb-interface";
import type { ChangeLog } from "../../prisma/client";
import type { PrismaClient } from "../../prisma/client";
import { validators, keyPathValidators } from "../validators";

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

export interface SyncResult {
  id: string;
  oldKeyPath?: Array<string | number>;
  entityKeyPath: Array<string | number>;
  mergedRecord?: unknown;
  serverVersion?: number;
  error?: string | null;
}

export async function applyPush({
  events,
  scopeKey,
  prisma,
  customValidation,
}: {
  events: OutboxEventRecord[];
  scopeKey: string | ((event: OutboxEventRecord) => string);
  prisma: PrismaClient;
  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>;
}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const event of events) {
    try {
      const resolvedScopeKey = typeof scopeKey === "function" ? scopeKey(event) : scopeKey;
      let result: SyncResult;
      switch (event.entityType) {
        case "Board": {
          {
            const validation = validators.Board.safeParse(event.payload);
            if (!validation.success) throw new Error(`Validation failed: ${validation.error.message}`);

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncBoard(event, validation.data, resolvedScopeKey, prisma);
            break;
          }
        }
        case "Todo": {
          {
            const validation = validators.Todo.safeParse(event.payload);
            if (!validation.success) throw new Error(`Validation failed: ${validation.error.message}`);

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncTodo(event, validation.data, resolvedScopeKey, prisma);
            break;
          }
        }
        case "User": {
          {
            const validation = validators.User.safeParse(event.payload);
            if (!validation.success) throw new Error(`Validation failed: ${validation.error.message}`);

            if (customValidation) {
              const ok = await customValidation(event as EventsFor<typeof validators>);
              if (!ok) throw new Error("custom validation failed");
            }

            result = await syncUser(event, validation.data, resolvedScopeKey, prisma);
            break;
          }
        }
        default:
          throw new Error(`No sync handler for ${event.entityType}`);
      }
      results.push(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      results.push({ id: event.id, error: errorMessage, entityKeyPath: event.entityKeyPath });
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
  {
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
}

async function syncBoard(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.Board>,
  scopeKey: string,
  prisma: PrismaClient
): Promise<SyncResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.Board.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new Error("Invalid entityKeyPath for Board");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.Board>) => {
    {
      const record = await prisma.board.findUnique({
        where: { id: keyPathArg[0] },
        select: { user: { select: { id: true } } },
      });

      if (!record) {
        throw new Error(`Board not found`);
      }

      const root = record.user;
      if (!root) {
        throw new Error(`Board is not connected to User`);
      }
      if (root.id !== scopeKey) {
        throw new Error(`Unauthorized: Board is not owned by the authenticated scope`);
      }
    }
  };

  switch (operation) {
    case "create": {
      if (!data.userId) {
        throw new Error(`Missing parent reference: userId`);
      }
      const parentRecord = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true },
      });

      if (!parentRecord) {
        throw new Error(`User not found`);
      }
      if (parentRecord.id !== scopeKey) {
        throw new Error(`Unauthorized: Board parent is not owned by authenticated scope`);
      }
      const [result] = await prisma.$transaction([
        prisma.board.create({ data }),
        prisma.changeLog.create({
          data: {
            model: "Board",
            keyPath: validKeyPath,
            operation: "create",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const [result] = await prisma.$transaction([
        prisma.board.update({
          where: { id: validKeyPath[0] },
          data,
        }),
        prisma.changeLog.create({
          data: {
            model: "Board",
            keyPath: validKeyPath,
            oldKeyPath,
            operation: "update",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      await prisma.$transaction([
        prisma.board.delete({
          where: { id: validKeyPath[0] },
        }),
        prisma.changeLog.create({
          data: {
            model: "Board",
            keyPath: validKeyPath,
            operation: "delete",
            scopeKey,
          },
        }),
      ]);
      return { id, entityKeyPath: validKeyPath };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function syncTodo(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.Todo>,
  scopeKey: string,
  prisma: PrismaClient
): Promise<SyncResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.Todo.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new Error("Invalid entityKeyPath for Todo");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.Todo>) => {
    {
      const record = await prisma.todo.findUnique({
        where: { id: keyPathArg[0] },
        select: { board: { select: { user: { select: { id: true } } } } },
      });

      if (!record) {
        throw new Error(`Todo not found`);
      }

      const root = record.board.user;
      if (!root) {
        throw new Error(`Todo is not connected to User`);
      }
      if (root.id !== scopeKey) {
        throw new Error(`Unauthorized: Todo is not owned by the authenticated scope`);
      }
    }
  };

  switch (operation) {
    case "create": {
      if (!data.boardId) {
        throw new Error(`Missing parent reference: boardId`);
      }
      const parentRecord = await prisma.board.findUnique({
        where: { id: data.boardId },
        select: { user: { select: { id: true } } },
      });

      if (!parentRecord) {
        throw new Error(`Board not found`);
      }

      const root = parentRecord.user;
      if (!root) {
        throw new Error(`Board is not connected to User`);
      }
      if (root.id !== scopeKey) {
        throw new Error(`Unauthorized: Todo parent is not owned by authenticated scope`);
      }
      const [result] = await prisma.$transaction([
        prisma.todo.create({ data }),
        prisma.changeLog.create({
          data: {
            model: "Todo",
            keyPath: validKeyPath,
            operation: "create",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const [result] = await prisma.$transaction([
        prisma.todo.update({
          where: { id: validKeyPath[0] },
          data,
        }),
        prisma.changeLog.create({
          data: {
            model: "Todo",
            keyPath: validKeyPath,
            oldKeyPath,
            operation: "update",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      await prisma.$transaction([
        prisma.todo.delete({
          where: { id: validKeyPath[0] },
        }),
        prisma.changeLog.create({
          data: {
            model: "Todo",
            keyPath: validKeyPath,
            operation: "delete",
            scopeKey,
          },
        }),
      ]);
      return { id, entityKeyPath: validKeyPath };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function syncUser(
  event: OutboxEventRecord,
  data: z.infer<typeof validators.User>,
  scopeKey: string,
  prisma: PrismaClient
): Promise<SyncResult> {
  const { id, entityKeyPath, operation } = event;
  const keyPathValidation = keyPathValidators.User.safeParse(entityKeyPath);
  if (!keyPathValidation.success) {
    throw new Error("Invalid entityKeyPath for User");
  }

  const validKeyPath = keyPathValidation.data;

  const verifyOwnership = async (keyPathArg: z.infer<typeof keyPathValidators.User>) => {
    {
      if (keyPathArg[0] !== scopeKey) {
        throw new Error(`Unauthorized: User pk does not match authenticated scope`);
      }
    }
  };

  switch (operation) {
    case "create": {
      if (scopeKey !== data.id) {
        throw new Error(`Unauthorized: root model pk must match authenticated scope`);
      }
      const [result] = await prisma.$transaction([
        prisma.user.create({ data }),
        prisma.changeLog.create({
          data: {
            model: "User",
            keyPath: validKeyPath,
            operation: "create",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "update": {
      await verifyOwnership(validKeyPath);
      const oldKeyPath = [...validKeyPath];
      const [result] = await prisma.$transaction([
        prisma.user.update({
          where: { id: validKeyPath[0] },
          data,
        }),
        prisma.changeLog.create({
          data: {
            model: "User",
            keyPath: validKeyPath,
            oldKeyPath,
            operation: "update",
            scopeKey,
          },
        }),
      ]);
      const newKeyPath = [result.id];
      return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };
    }

    case "delete": {
      await verifyOwnership(validKeyPath);
      await prisma.$transaction([
        prisma.user.delete({
          where: { id: validKeyPath[0] },
        }),
        prisma.changeLog.create({
          data: {
            model: "User",
            keyPath: validKeyPath,
            operation: "delete",
            scopeKey,
          },
        }),
      ]);
      return { id, entityKeyPath: validKeyPath };
    }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

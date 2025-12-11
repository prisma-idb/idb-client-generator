import { prisma } from "$lib/prisma";
import { json } from "@sveltejs/kit";
import type { OutboxEventRecord } from "../../prisma/prisma-idb/idb-interface";

export const POST = async ({ request }: { request: Request }) => {
  try {
    const body = await request.json();
    const events: OutboxEventRecord[] = body.events || [body];

    console.log("Received sync batch:", events.length, "events");

    // Process events in order to maintain FK constraints
    const results = [];
    for (const event of events) {
      console.log("Processing event:", {
        id: event.id,
        entityType: event.entityType,
        operation: event.operation,
        entityId: event.entityId,
      });

      let result;
      if (event.entityType === "Todo") {
        result = await handleTodoSync(event);
      } else if (event.entityType === "User") {
        result = await handleUserSync(event);
      } else {
        result = {
          id: event.id,
          error: `Unknown entity type: ${event.entityType}`,
        };
      }

      results.push(result);
    }

    return json(results);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Sync error:", errorMessage);
    return json([{ error: errorMessage }], { status: 500 });
  }
};

async function handleTodoSync(event: OutboxEventRecord) {
  const payload = event.payload as any;

  try {
    switch (event.operation) {
      case "create": {
        if (!payload) {
          return {
            id: event.id,
            error: "Missing payload for create operation",
          };
        }

        const todo = await prisma.todo.create({
          data: {
            id: payload.id,
            title: payload.title,
            completed: payload.completed ?? false,
            userId: payload.userId,
          },
        });
        return {
          id: event.id,
          entityId: todo.id,
          serverVersion: 1,
          mergedRecord: todo,
        };
      }

      case "update": {
        if (!event.entityId) {
          return {
            id: event.id,
            error: "Missing entityId for update",
          };
        }

        if (!payload) {
          return {
            id: event.id,
            error: "Missing payload for update operation",
          };
        }

        const todo = await prisma.todo.update({
          where: { id: event.entityId },
          data: {
            title: payload.title,
            completed: payload.completed,
          },
        });
        return {
          id: event.id,
          entityId: todo.id,
          serverVersion: 2,
          mergedRecord: todo,
        };
      }

      case "delete": {
        if (!event.entityId) {
          return {
            id: event.id,
            error: "Missing entityId for delete",
          };
        }

        await prisma.todo.delete({
          where: { id: event.entityId },
        });
        return {
          id: event.id,
          entityId: event.entityId,
          serverVersion: 3,
        };
      }

      default:
        return {
          id: event.id,
          error: `Unknown operation: ${event.operation}`,
        };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Todo ${event.operation} sync error:`, errorMessage);
    return {
      id: event.id,
      error: errorMessage,
    };
  }
}

async function handleUserSync(event: OutboxEventRecord) {
  const payload = event.payload as any;

  try {
    switch (event.operation) {
      case "create": {
        if (!payload) {
          return {
            id: event.id,
            error: "Missing payload for create operation",
          };
        }

        const user = await prisma.user.create({
          data: {
            id: payload.id,
            name: payload.name,
          },
        });
        return {
          id: event.id,
          entityId: user.id,
          serverVersion: 1,
          mergedRecord: user,
        };
      }

      case "update": {
        if (!event.entityId) {
          return {
            id: event.id,
            error: "Missing entityId for update",
          };
        }

        if (!payload) {
          return {
            id: event.id,
            error: "Missing payload for update operation",
          };
        }

        const user = await prisma.user.update({
          where: { id: parseInt(event.entityId) },
          data: {
            name: payload.name,
          },
        });
        return {
          id: event.id,
          entityId: user.id,
          serverVersion: 2,
          mergedRecord: user,
        };
      }

      case "delete": {
        if (!event.entityId) {
          return {
            id: event.id,
            error: "Missing entityId for delete",
          };
        }

        await prisma.user.delete({
          where: { id: parseInt(event.entityId) },
        });
        return {
          id: event.id,
          entityId: event.entityId,
          serverVersion: 3,
        };
      }

      default:
        return {
          id: event.id,
          error: `Unknown operation: ${event.operation}`,
        };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`User ${event.operation} sync error:`, errorMessage);
    return {
      id: event.id,
      error: errorMessage,
    };
  }
}
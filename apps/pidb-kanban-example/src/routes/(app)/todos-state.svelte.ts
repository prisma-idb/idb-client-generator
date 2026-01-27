import { browser } from "$app/environment";
import { getClient } from "$lib/clients/idb-client";
import { toast } from "svelte-sonner";
import { createContext } from "svelte";
import type { Prisma } from "$lib/generated/prisma/client";
import type { SyncWorker } from "$lib/prisma-idb/client/idb-interface";

export class TodosState {
  boards = $state<Prisma.BoardGetPayload<{ include: { todos: true } }>[]>();
  syncWorker = $state<SyncWorker>();

  private boardCallback = () => this.loadBoards();
  private todoCallback = () => this.loadBoards();

  constructor() {
    if (browser) {
      this.syncWorker = getClient().createSyncWorker({
        push: {
          handler: async (events) => {
            const pushResult = await fetch("/api/sync/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events }),
            });
            if (!pushResult.ok) {
              throw new Error(`Push failed with status ${pushResult.status}`);
            }
            return pushResult.json();
          },
          batchSize: 50,
        },
        pull: {
          handler: async (cursor) => {
            const pullResult = await fetch("/api/sync/pull", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lastChangelogId: cursor?.toString() }),
            });
            if (!pullResult.ok) {
              throw new Error(`Pull failed with status ${pullResult.status}`);
            }
            const pullData = await pullResult.json();

            // Convert string cursor back to BigInt (explicit null/undefined check to allow 0)
            if (pullData.cursor != null) {
              pullData.cursor = BigInt(pullData.cursor);
            }

            this.loadBoards();
            return pullData;
          },
          getCursor: () => this.getCursor(),
          setCursor: (cursor) => this.setCursor(cursor),
        },
        schedule: {
          intervalMs: 10000,
          maxRetries: 3,
        },
      });
      this.loadBoards();

      getClient().board.subscribe(["create", "update", "delete"], this.boardCallback);
      getClient().todo.subscribe(["create", "update", "delete"], this.todoCallback);
    }
  }

  getCursor() {
    if (!browser) throw new Error("Not in browser environment");
    const lastSyncedAt = localStorage.getItem("lastSyncedAt");
    if (!lastSyncedAt) return undefined;
    try {
      return BigInt(lastSyncedAt);
    } catch {
      localStorage.removeItem("lastSyncedAt");
      return undefined;
    }
  }

  setCursor(cursor: bigint | undefined) {
    if (!browser) throw new Error("Not in browser environment");
    if (cursor !== undefined) {
      localStorage.setItem("lastSyncedAt", cursor.toString());
    } else {
      localStorage.removeItem("lastSyncedAt");
    }
  }

  async loadBoards() {
    try {
      this.boards = await getClient().board.findMany({ include: { todos: true } });
    } catch (error) {
      console.error("Error loading boards:", error);
      toast.error("Failed to load boards");
    }
  }

  async addBoard(name: string) {
    try {
      const currentUser = await getClient().user.findFirst();
      if (!currentUser) {
        toast.error("No user found. Please log in.");
        return;
      }
      await getClient().board.create({ data: { name, userId: currentUser.id } });
    } catch (error) {
      console.error("Error creating board:", error);
      toast.error("Failed to create board");
    }
  }

  async deleteBoard(boardId: string) {
    try {
      await getClient().board.delete({ where: { id: boardId } });
    } catch (error) {
      console.error("Error deleting board:", error);
      toast.error("Failed to delete board");
    }
  }

  async addTodoToBoard(boardId: string, title: string, description: string) {
    try {
      await getClient().todo.create({
        data: { title, description, boardId },
      });
    } catch (error) {
      console.error("Error adding todo:", error);
      toast.error("Failed to add todo");
    }
  }

  async syncWithServer() {
    if (!this.syncWorker) return;
    this.syncWorker.start();
    toast.success("Sync cycle started", { description: "Data will keep syncing in the background" });
  }

  destroy() {
    getClient().board.unsubscribe(["create", "update", "delete"], this.boardCallback);
    getClient().todo.unsubscribe(["create", "update", "delete"], this.todoCallback);
    this.syncWorker?.stop?.();
  }
}

export const [getTodosContext, setTodosContext] = createContext<TodosState>();

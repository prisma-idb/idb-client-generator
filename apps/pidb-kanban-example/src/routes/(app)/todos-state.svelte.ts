import { browser } from "$app/environment";
import { client } from "$lib/clients/idb-client";
import { toast } from "svelte-sonner";
import { createContext } from "svelte";
import type { Prisma } from "$lib/generated/prisma/client";
import type { SyncWorker } from "$lib/generated/prisma-idb/client/idb-interface";
import { syncPull, syncPush } from "./data.remote";

export class TodosState {
  boards = $state<Prisma.BoardGetPayload<{ include: { todos: true } }>[]>();
  syncWorker = $state<SyncWorker>();

  constructor() {
    if (browser) {
      this.syncWorker = client.createSyncWorker({
        push: {
          handler: (events) => syncPush(events),
          batchSize: 50,
        },
        pull: {
          handler: (cursor) => syncPull({ lastChangelogId: cursor }),
          getCursor: () => this.getCursor(),
          setCursor: (cursor) => this.setCursor(cursor),
        },
        schedule: {
          intervalMs: 10000,
          maxRetries: 3,
        },
      });
      this.loadBoards();

      client.board.subscribe(["create", "update", "delete"], () => {
        this.loadBoards();
      });
      client.todo.subscribe(["create", "update", "delete"], () => {
        this.loadBoards();
      });
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
    if (cursor) {
      localStorage.setItem("lastSyncedAt", cursor.toString());
    } else {
      localStorage.removeItem("lastSyncedAt");
    }
  }

  async loadBoards() {
    this.boards = await client.board.findMany({ include: { todos: true } });
  }

  async addBoard(name: string) {
    const currentUser = await client.user.findFirst();
    if (!currentUser) {
      toast.error("No user found. Please log in.");
      return;
    }

    await client.board.create({ data: { name, userId: currentUser.id } });
  }

  async deleteBoard(boardId: string) {
    await client.board.delete({ where: { id: boardId } });
  }

  async addTodoToBoard(boardId: string, title: string, description: string) {
    await client.todo.create({
      data: { title, description, boardId },
    });
  }

  async syncWithServer() {
    if (!this.syncWorker) return;
    try {
      this.syncWorker.start();
      toast.success("Sync started! Processing outbox events...");
    } catch (error) {
      console.error("Error starting sync worker:", error);
      toast.error("Failed to start sync worker");
    }
  }
}

export const [getTodosContext, setTodosContext] = createContext<TodosState>();

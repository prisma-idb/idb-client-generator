import { getDb } from "$lib/prisma/db";
import type { Contract } from "$lib/prisma/contract";
import type { DefaultModelRow, IncludedRow } from "@prisma-next-idb/client-idb/orm";
import type { LogWithRecord, OutboxEvent, PushResult, SyncWorker } from "@prisma-next-idb/sync-extension-idb/client";
import { SvelteDate, SvelteURLSearchParams } from "svelte/reactivity";

export type User = DefaultModelRow<Contract, "User">;
export type Board = DefaultModelRow<Contract, "Board">;
export type Todo = DefaultModelRow<Contract, "Todo">;
export type BoardWithTodos = IncludedRow<Contract, "Board", { todos: true }>;

export const KANBAN_CTX = Symbol("kanban");

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class KanbanStore {
  status = $state<"opening" | "ready" | "error">("opening");
  errorMessage = $state("");
  users = $state<User[]>([]);
  boards = $state<BoardWithTodos[]>([]);
  activeUserId = $state<string | null>(null);
  busy = $state(false);
  syncWorker: SyncWorker | null = null;
  private syncStarting = false;

  activeUser = $derived(this.users.find((u) => u.id === this.activeUserId) ?? null);
  todos = $derived(this.boards.flatMap((b) => b.todos));
  completedTodos = $derived(this.todos.filter((t) => t.isCompleted).length);

  showError = (error: unknown) => {
    this.status = "error";
    this.errorMessage = error instanceof Error ? error.message : "Something went wrong.";
    this.busy = false;
  };

  rememberActiveUser(userId: string | null) {
    this.activeUserId = userId;
    if (userId) {
      localStorage.setItem("prisma-next-kanban-active-user", userId);
    } else {
      localStorage.removeItem("prisma-next-kanban-active-user");
    }
  }

  private async loadBoards(userId: string | null) {
    if (!userId) {
      this.boards = [];
      return;
    }
    const db = await getDb();
    this.boards = await db.orm.board
      .where({ userId })
      .orderBy({ createdAt: "asc" })
      .include("todos", (todo) => todo.orderBy({ createdAt: "asc" }))
      .all()
      .toArray();
  }

  async loadWorkspace(preferredUserId = this.activeUserId) {
    this.status = "opening";
    this.errorMessage = "";
    const db = await getDb();
    const markerOk = await db.verifyMarker();
    if (!markerOk) throw new Error("Prisma Next IDB opened, but marker verification failed.");

    this.users = await db.orm.user.orderBy({ name: "asc" }).all().toArray();

    const remembered = localStorage.getItem("prisma-next-kanban-active-user");
    const nextActive =
      this.users.find((u) => u.id === preferredUserId)?.id ??
      this.users.find((u) => u.id === remembered)?.id ??
      this.users[0]?.id ??
      null;
    this.rememberActiveUser(nextActive);

    await this.loadBoards(nextActive);
    this.status = "ready";
    this.startSync();
  }

  /**
   * ADR 014 push/pull, wired against src/routes/api/sync (Postgres-backed).
   * `scopeKey` is read from `this.activeUserId` at call time, not captured
   * once — so a single worker instance survives `switchUser()` without
   * needing to be torn down and recreated. Demo-level simplification (see
   * push/+server.ts's header): `scopeKey` here is just the locally-picked
   * active user, not anything a real server would trust as an identity
   * claim.
   */
  private startSync() {
    if (this.syncWorker || this.syncStarting) return;
    this.syncStarting = true;

    const pushHandler = async (events: OutboxEvent[], signal: AbortSignal): Promise<PushResult[]> => {
      const scopeKey = this.activeUserId;
      if (!scopeKey) return events.map((e) => ({ id: e.id, success: false, error: "No active user" }));
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events, scopeKey }),
        signal,
      });
      if (!res.ok) throw new Error(`Push failed: ${res.status}`);
      return res.json();
    };

    const pullHandler = async (fromChangelogId: string | null, signal: AbortSignal): Promise<LogWithRecord[]> => {
      const scopeKey = this.activeUserId;
      if (!scopeKey) return [];
      const params = new SvelteURLSearchParams({ scopeKey });
      if (fromChangelogId) params.set("since", fromChangelogId);
      const res = await fetch(`/api/sync/pull?${params}`, { signal });
      if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
      return res.json();
    };

    getDb()
      .then((db) => {
        this.syncWorker = db.createSyncWorker({ pushHandler, pullHandler });
        this.syncWorker.on("pullcompleted", ({ applied }) => {
          if (applied > 0) this.loadBoards(this.activeUserId).catch(this.showError);
        });
        this.syncWorker.start();
        this.syncStarting = false;
      })
      .catch((error: unknown) => {
        this.syncStarting = false;
        this.showError(error);
      });
  }

  async switchUser(userId: string) {
    this.rememberActiveUser(userId);
    this.busy = true;
    this.errorMessage = "";
    try {
      await this.loadBoards(userId);
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async createUser(name: string, email: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      const id = makeId("user");
      await db.orm.user.create({ id, name, email: email || null });
      this.users = [...this.users, { id, name, email: email || null }].sort((a, b) => a.name.localeCompare(b.name));
      this.rememberActiveUser(id);
      this.boards = [];
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async updateUser(userId: string, name: string, email: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.user.where({ id: userId }).update({ name, email: email || null });
      this.users = this.users
        .map((u) => (u.id === userId ? { ...u, name, email: email || null } : u))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async deleteUser(userId: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.user.delete(userId);
      this.users = this.users.filter((u) => u.id !== userId);
      this.rememberActiveUser(null);
      this.boards = [];
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async createBoard(name: string) {
    const userId = this.activeUserId;
    if (!userId) return;
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      const id = makeId("board");
      const createdAt = new SvelteDate();
      await db.orm.board.create({ id, name, createdAt, userId });
      this.boards = [...this.boards, { id, name, createdAt, userId, todos: [] }];
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async updateBoard(boardId: string, name: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.board.where({ id: boardId }).update({ name });
      this.boards = this.boards.map((b) => (b.id === boardId ? { ...b, name } : b));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async deleteBoard(boardId: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.board.delete(boardId);
      this.boards = this.boards.filter((b) => b.id !== boardId);
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async createTodo(boardId: string, title: string, description: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      const id = makeId("todo");
      const createdAt = new SvelteDate();
      await db.orm.todo.create({
        id,
        title,
        description: description || null,
        isCompleted: false,
        createdAt,
        boardId,
      });
      this.boards = this.boards.map((b) =>
        b.id === boardId
          ? {
              ...b,
              todos: [
                ...b.todos,
                { id, title, description: description || null, isCompleted: false, createdAt, boardId },
              ],
            }
          : b
      );
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async toggleTodo(todoId: string, currentValue: boolean) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      const next = !currentValue;
      await db.orm.todo.where({ id: todoId }).update({ isCompleted: next });
      this.boards = this.boards.map((b) => ({
        ...b,
        todos: b.todos.map((t) => (t.id === todoId ? { ...t, isCompleted: next } : t)),
      }));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async updateTodo(todoId: string, title: string, description: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.todo.where({ id: todoId }).update({ title, description: description || null });
      this.boards = this.boards.map((b) => ({
        ...b,
        todos: b.todos.map((t) => (t.id === todoId ? { ...t, title, description: description || null } : t)),
      }));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }

  async deleteTodo(todoId: string) {
    this.busy = true;
    this.errorMessage = "";
    try {
      const db = await getDb();
      await db.orm.todo.delete(todoId);
      this.boards = this.boards.map((b) => ({
        ...b,
        todos: b.todos.filter((t) => t.id !== todoId),
      }));
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
    }
  }
}

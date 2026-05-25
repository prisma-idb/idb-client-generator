import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import { getDb } from "./db";

export type User = { id: string; name: string; email: string };

export class UsersState {
  users: User[] = $state([]);
  loading = $state(true);
  error: string | null = $state(null);

  readonly #contract: IdbContract;

  constructor(contract: IdbContract) {
    this.#contract = contract;
  }

  async load() {
    try {
      const db = await getDb(this.#contract);
      this.users = (await db.orm.users.orderBy({ name: "asc" }).all().toArray()) as User[];
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async create(name: string, email: string) {
    const db = await getDb(this.#contract);
    await db.orm.users.create({ id: crypto.randomUUID(), name, email });
    await this.load();
  }

  async remove(id: string) {
    const db = await getDb(this.#contract);
    await db.orm.users.delete(id);
    await this.load();
  }
}

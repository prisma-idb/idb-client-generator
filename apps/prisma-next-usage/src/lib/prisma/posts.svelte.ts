import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import { getDb } from "./db";

export type Post = { id: string; title: string; content: string; authorId: string };

export class PostsState {
  posts: Post[] = $state([]);
  loading = $state(true);
  error: string | null = $state(null);

  readonly #contract: IdbContract;
  readonly #authorId: string;

  constructor(contract: IdbContract, authorId: string) {
    this.#contract = contract;
    this.#authorId = authorId;
  }

  async load() {
    try {
      const db = await getDb(this.#contract);
      this.posts = (await db.orm.posts.where({ authorId: this.#authorId }).all().toArray()) as Post[];
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async create(title: string, content: string) {
    const db = await getDb(this.#contract);
    await db.orm.posts.create({
      id: crypto.randomUUID(),
      title,
      content,
      authorId: this.#authorId,
    });
    await this.load();
  }

  async remove(id: string) {
    const db = await getDb(this.#contract);
    await db.orm.posts.delete(id);
    await this.load();
  }
}

import type { ControlDriverDescriptor, ControlDriverInstance } from "@prisma-next/framework-components/control";
import { idbDriverDescriptorMeta } from "../core/descriptor-meta";

/**
 * Control-plane driver for IndexedDB.
 *
 * `ControlDriverInstance` is a SQL-flavoured interface (it exposes `query()`
 * and `close()`), which does not map naturally onto IndexedDB. This class
 * satisfies the interface as a stub. The IDB family's control plane bypasses
 * the driver entirely and reads/writes a schema manifest file on disk instead
 * of opening a live database connection.
 *
 * @see IdbControlFamilyInstance — where actual schema management logic lives.
 */
class IdbControlDriver implements ControlDriverInstance<"idb", "idb"> {
  readonly familyId = "idb" as const;
  readonly targetId = "idb" as const;

  /**
   * Not implemented. IndexedDB has no SQL interface and cannot be queried
   * from Node. The IDB family uses the schema manifest file for all
   * control-plane operations instead of issuing queries through the driver.
   */
  async query<Row = Record<string, unknown>>(
    _sql: string,
    _params?: readonly unknown[]
  ): Promise<{ readonly rows: Row[] }> {
    return { rows: [] };
  }

  /**
   * No-op. There is no persistent connection to close — the schema manifest
   * file is accessed directly by the family instance, not through this driver.
   */
  async close(): Promise<void> {}
}

const idbControlDriverDescriptor: ControlDriverDescriptor<"idb", "idb", IdbControlDriver> = {
  ...idbDriverDescriptorMeta,
  async create(_dbName: string): Promise<IdbControlDriver> {
    // TODO: open IDBDatabase
    return new IdbControlDriver();
  },
};

export default idbControlDriverDescriptor;

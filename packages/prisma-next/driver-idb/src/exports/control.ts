import type { ControlDriverDescriptor, ControlDriverInstance } from "@prisma-next/framework-components/control";
import { idbDriverDescriptorMeta } from "../core/descriptor-meta";

class IdbControlDriver implements ControlDriverInstance<"idb", "idb"> {
  readonly familyId = "idb" as const;
  readonly targetId = "idb" as const;

  async query<Row = Record<string, unknown>>(
    _sql: string,
    _params?: readonly unknown[]
  ): Promise<{ readonly rows: Row[] }> {
    // TODO: IDB does not support SQL queries; implement IDB-native introspection
    return { rows: [] };
  }

  async close(): Promise<void> {
    // TODO: close IDBDatabase
  }
}

const idbControlDriverDescriptor: ControlDriverDescriptor<"idb", "idb", IdbControlDriver> = {
  ...idbDriverDescriptorMeta,
  async create(_dbName: string): Promise<IdbControlDriver> {
    // TODO: open IDBDatabase
    return new IdbControlDriver();
  },
};

export default idbControlDriverDescriptor;

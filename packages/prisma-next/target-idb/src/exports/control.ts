import type { Contract } from "@prisma-next/contract/types";
import type { TargetBoundComponentDescriptor } from "@prisma-next/framework-components/components";
import type {
  ControlFamilyInstance,
  ControlTargetInstance,
  MigratableTargetDescriptor,
  TargetMigrationsCapability,
} from "@prisma-next/framework-components/control";
import { idbTargetDescriptorMeta } from "../core/descriptor-meta";
import { IdbMigrationPlanner, contractToIdbSchema } from "../core/migration-planner";
import { IdbMigrationRunner } from "../core/migration-runner";

const idbMigrationsCapability = {
  createPlanner(_family: ControlFamilyInstance<"idb", unknown>) {
    return new IdbMigrationPlanner();
  },
  createRunner(_family: ControlFamilyInstance<"idb", unknown>) {
    return new IdbMigrationRunner();
  },
  contractToSchema(
    contract: Contract | null,
    _frameworkComponents?: ReadonlyArray<TargetBoundComponentDescriptor<"idb", "idb">>
  ) {
    return contractToIdbSchema(contract);
  },
} satisfies TargetMigrationsCapability<"idb", "idb">;

const idbControlTargetDescription = {
  ...idbTargetDescriptorMeta,
  migrations: idbMigrationsCapability,
  create(): ControlTargetInstance<"idb", "idb"> {
    return { familyId: "idb", targetId: "idb" };
  },
} satisfies MigratableTargetDescriptor<"idb", "idb">;

export default idbControlTargetDescription;
export { IdbMigrationControlDriverDescriptor, extractMigrationDriver } from "../core/migration-driver";
export type { IdbMigrationControlDriver } from "../core/migration-driver";

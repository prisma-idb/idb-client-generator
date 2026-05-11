import type { CodecCallContext, CodecLookup } from "@prisma-next/framework-components/codec";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbQueryPlan } from "./idb-query-plan";
import type { IdbRuntimeAdapterInstance } from "./runtime-adapter-instance";

/**
 * Concrete IDB runtime adapter.
 *
 * Implements {@link IdbRuntimeAdapterInstance} — the `lower()` method that
 * translates an {@link IdbQueryPlan} into an {@link IdbPlanBody} ready for
 * the driver.
 *
 * **Phase 3b:** `lower()` is a structural passthrough. The `idbPlan` carried
 * by `IdbQueryPlan` is already execution-ready (IDB has no query language to
 * compile from). The `codecs` lookup and `ctx.signal` are stored for Phase 4,
 * when `IdbExecutionContext` provides the per-store field→codec schema and
 * per-field encoding is applied before the plan reaches the driver.
 *
 * **Phase 4 note:** full codec encoding wires up here. Each record field in
 * `put`/`update` plans will be encoded via the schema's codec for that field
 * (e.g. `idb/date@1`, custom codecs). Key values in `key-get`/`delete` plans
 * will likewise be encoded. Since all current `idb/*` codecs are identity
 * transforms, Phase 3b output is identical to Phase 4 output for the standard
 * type set.
 */
export class IdbAdapter implements IdbRuntimeAdapterInstance {
  readonly familyId = "idb" as const;
  readonly targetId = "idb" as const;

  readonly #codecs: CodecLookup;

  constructor(codecs: CodecLookup) {
    this.#codecs = codecs;
  }

  lower(plan: IdbQueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody> {
    // Phase 3b: passthrough — idbPlan is execution-ready as-is.
    // Phase 4 will walk plan.idbPlan's record/key fields here, look up each
    // field's codec via this.#codecs + the schema descriptor, and call
    // codec.encode(value, ctx) to produce the wire value.
    void this.#codecs; // reserved for Phase 4
    void ctx; // reserved for Phase 4 (AbortSignal threading to codec.encode)
    return Promise.resolve(plan.idbPlan);
  }
}

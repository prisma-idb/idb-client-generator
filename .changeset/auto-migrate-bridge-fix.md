---
"@prisma-next-idb/client-idb": patch
---

Fixes `createAutoMigratingIdbClient` getting permanently stuck behind a hash-only "bridge" migration — one whose package has zero ops because only the contract's hashing changed, not its structure. The per-space marker write was previously gated on `pendingOps.length > 0`, so a space with an empty-ops package never wrote its marker forward to `targetHash`; since nothing changes on a retry either, the space could never converge. The marker now advances whenever it's behind `targetHash`, regardless of whether the migration itself had any ops to apply.

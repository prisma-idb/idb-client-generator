import { command, getRequestEvent } from "$app/server";
import { applyPush, materializeLogs } from "$lib/generated/prisma-idb/server/batch-processor";
import { auth } from "$lib/server/auth";
import { prisma } from "$lib/server/prisma";
import { error } from "@sveltejs/kit";
import z from "zod";

const batchRecordSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityKeyPath: z.array(z.any()),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.any(),
  clientMeta: z.any().optional(),
  createdAt: z.coerce.date(),
  tries: z.number(),
  lastError: z.string().nullable(),
  synced: z.boolean(),
  syncedAt: z.coerce.date().nullable(),
});

async function getAuthenticatedUser() {
  const event = getRequestEvent();
  const authData = await auth.api.getSession({ headers: event.request.headers });
  if (!authData?.user.id) throw error(401, "Unauthorized");
  return authData.user;
}

export const syncPush = command(z.array(batchRecordSchema), async (events) => {
  const user = await getAuthenticatedUser();

  return await applyPush({
    events,
    scopeKey: user.id,
    prisma,
  });
});

export const syncPull = command(z.object({ lastChangelogId: z.bigint().optional() }).optional(), async (input) => {
  const user = await getAuthenticatedUser();

  const logs = await prisma.changeLog.findMany({
    where: {
      scopeKey: user.id,
      id: { gt: input?.lastChangelogId ?? 0n },
    },
    orderBy: { id: "asc" },
    take: 50,
  });

  const logsWithRecords = await materializeLogs({ logs, prisma });

  return {
    cursor: BigInt(logs.at(-1)?.id ?? input?.lastChangelogId ?? 0n),
    logsWithRecords,
  };
});

import { applyPush } from "$lib/generated/prisma-idb/server/batch-processor";
import { auth } from "$lib/server/auth";
import { prisma } from "$lib/server/prisma";
import z from "zod";

const batchRecordSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.any(),
  createdAt: z.coerce.date(),
  tries: z.number(),
  lastError: z.string().nullable(),
  synced: z.boolean(),
  syncedAt: z.coerce.date().nullable(),
  retryable: z.boolean(),
});

export async function POST({ request }) {
  const pushRequestBody = await request.json();

  const parsed = z.object({ events: z.array(batchRecordSchema), clientId: z.string() }).safeParse({
    events: pushRequestBody.events,
    clientId: pushRequestBody.clientId,
  });

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error }), {
      status: 400,
    });
  }

  const authResult = await auth.api.getSession({ headers: request.headers });
  if (!authResult?.user.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const pushResults = await applyPush({
    events: parsed.data.events,
    scopeKey: authResult.user.id,
    originId: parsed.data.clientId,
    prisma,
  });

  return new Response(JSON.stringify(pushResults), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

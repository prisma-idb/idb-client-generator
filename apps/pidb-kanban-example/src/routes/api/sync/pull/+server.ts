import { materializeLogs } from "$lib/generated/prisma-idb/server/batch-processor";
import { auth } from "$lib/server/auth";
import { prisma } from "$lib/server/prisma";
import z from "zod";

export async function POST({ request }) {
  const pullRequestBody = await request.json();

  const parsed = z
    .object({ lastChangelogId: z.bigint().optional() })
    .safeParse({ lastChangelogId: pullRequestBody.lastChangelogId });

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error }), {
      status: 400,
    });
  }

  const authResult = await auth.api.getSession({ headers: request.headers });
  if (!authResult?.user.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const logs = await prisma.changeLog.findMany({
    where: {
      scopeKey: authResult.user.id,
      id: { gt: parsed.data.lastChangelogId ?? 0n },
    },
    orderBy: { id: "asc" },
    take: 50,
  });

  const logsWithRecords = await materializeLogs({ logs, prisma });

  return new Response(
    JSON.stringify({
      cursor: BigInt(logs.at(-1)?.id ?? parsed.data.lastChangelogId ?? 0n),
      logsWithRecords,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

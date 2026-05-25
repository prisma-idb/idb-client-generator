import { contract } from "$lib/prisma/contract.server";
import type { ServerLoadEvent } from "@sveltejs/kit";

export function load({ params }: ServerLoadEvent) {
  return { userId: params.id, contract };
}

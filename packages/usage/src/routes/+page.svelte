<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Label } from "$lib/components/ui/label";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { cn } from "$lib/utils";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { PrismaIDBClient } from "../prisma/prisma-idb/prisma-idb-client";

  let client = $state<PrismaIDBClient>();
  let query = $state("");
  let output = $state("");
  let eventOutput = $state("");

  onMount(async () => {
    client = await PrismaIDBClient.createClient();
    client.user.subscribe(["create", "delete", "update"], (e) => {
      eventOutput = JSON.stringify(e.detail, null, 2);
    });
  });

  async function executeQuery(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (!client) throw new Error("Client not instantiated");
      const result = await eval(`client.v.${query}`);
      await result;

      toast.success("Query executed successfully", { description: "Check console for more information" });
      console.log(result);
      output = JSON.stringify(result, null, 2);
    } catch (error) {
      if (error instanceof Error) toast.error("Error", { description: error.message });
      console.error(error);
    }
  }
</script>

<form class="flex w-full max-w-md flex-col gap-1.5" onsubmit={executeQuery}>
  <Label for="query">Query</Label>
  <Textarea
    data-testid="query-input"
    class={cn("h-24", { italic: query === "" })}
    id="query"
    placeholder={"user.create({ \n\tdata: { name: 'John Doe' } \n})"}
    required
    bind:value={query}
  />
  <Button type="submit">Run query</Button>
</form>

<div class="grid w-full max-w-md gap-1.5">
  <Label for="event-output">Event output (for user model)</Label>
  <code class={cn("rounded-md border p-2 text-sm", { "italic text-secondary-foreground/60": eventOutput === "" })}>
    <pre>{eventOutput === "" ? "No events fired yet" : eventOutput}</pre>
  </code>
</div>

<div class="grid w-full max-w-md gap-1.5">
  <Label for="output">Output</Label>
  <code class={cn("rounded-md border p-2 text-sm", { "italic text-secondary-foreground/60": output === "" })}>
    <pre>{output === "" ? "Run a query" : output}</pre>
  </code>
</div>

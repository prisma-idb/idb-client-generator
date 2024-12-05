<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Label } from "$lib/components/ui/label";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { PrismaIDBClient } from "../prisma/prisma-idb/prisma-idb-client";

  let client = $state<PrismaIDBClient>();
  let query = $state("");
  let output = $state("");

  onMount(async () => {
    client = await PrismaIDBClient.createClient();
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

<form class="flex w-full max-w-sm flex-col gap-1.5" onsubmit={executeQuery}>
  <Label for="query">Query</Label>
  <Input
    data-testid="query-input"
    id="query"
    placeholder={"user.create({ data: { name: 'John Doe' } })"}
    required
    bind:value={query}
  />
  <Button type="submit">Run query</Button>
</form>

<div class="grid w-full max-w-sm gap-1.5">
  <Label for="output">Output</Label>
  <code class="rounded-md border p-2"><pre>{output === "" ? "Run a query" : output}</pre></code>
</div>

<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { PrismaIDBClient } from "../prisma/prisma-idb/prisma-idb-client";

  const operations = ["findMany", "findFirst", "findUnique", "create"] as const;

  let client = $state<PrismaIDBClient>();
  let query = $state("");

  let selectedModelName = $state("");
  let selectedOperation = $state("");

  onMount(async () => {
    client = await PrismaIDBClient.create();
  });

  async function executeQuery(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (!client) throw new Error("Client not instantiated");

      // @ts-expect-error Really hacky, but fine for testing
      const result = await client[selectedModelName as Exclude<keyof PrismaIDBClient, "_db">][
        selectedOperation as (typeof operations)[number]
      ](JSON.parse(query));

      toast.success("Query executed successfully", { description: "Check console for more information" });
      console.log(result);
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
      console.error(error);
    }
  }
</script>

<form class="flex w-full max-w-sm flex-col gap-1.5" onsubmit={executeQuery}>
  <Select.Root required type="single" bind:value={selectedModelName}>
    <Label>Model name</Label>
    <Select.Trigger class="w-full max-w-sm">
      {selectedModelName === "" ? "Select a model" : selectedModelName}
    </Select.Trigger>
    <Select.Content>
      {#each Object.keys(client ?? {}) as modelName}
        {#if !modelName.startsWith("_")}
          <Select.Item value={modelName}>{modelName}</Select.Item>
        {/if}
      {/each}
    </Select.Content>
  </Select.Root>
  <br />

  <Select.Root required type="single" bind:value={selectedOperation}>
    <Label>Operation</Label>
    <Select.Trigger class="w-full max-w-sm">
      {selectedOperation === "" ? "Select an operation" : selectedOperation}
    </Select.Trigger>
    <Select.Content>
      {#each operations as operation}
        <Select.Item value={operation}>{operation}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
  <br />

  <Label for="query">Query</Label>
  <Input id="query" placeholder="Type here" required bind:value={query} />
  <Button type="submit">Run query</Button>
</form>

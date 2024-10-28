<script lang="ts">
  import { onMount } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import { PrismaIDBClient } from "$lib/prisma-idb/prisma-idb-client";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button";

  let client: PrismaIDBClient;
  let isCompleted = $state(false);

  const formData = {
    id: "",
    task: "",
	isCompleted,
  };

  let task = "";

  let id: String;


  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    task = target.value;
  }


  function AddTask() {
    let id = uuidv4();
    formData.task = task;
    formData.id = id;
	formData.isCompleted = isCompleted;
    console.log(formData);
    client.todo.create({ data: formData });
	console.log(client);
  }

  onMount(async () => {
    // Always instantiate on client-side (need IndexedDB)
    client = await PrismaIDBClient.getInstance();
  });
</script>

<main class="prose max-w-full">
  <div class="space-y-2">
    <Input
      type="text"
      placeholder="Enter task"
      class="max-w-xs"
      on:input={handleChange}
    />
    <button onclick={AddTask}>Add Task</button>
	<input type="checkbox" bind:checked={isCompleted}/>
  </div>
</main>

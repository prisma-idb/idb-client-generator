<script lang="ts">
  import { onMount } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import { PrismaIDBClient } from "$lib/prisma-idb/prisma-idb-client";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button, Root } from "$lib/components/ui/button";
  import * as Table from "$lib/components/ui/table";

  let client: PrismaIDBClient;
  let isCompleted = $state(false);

  let allTodos = $state([{}]);

  const formData = {
    id: "",
    task: "",
    isCompleted,
  };

  let task = "";

  let id: String;

  function handleChange(event: Event) {
    event.preventDefault();
    const target = event.target as HTMLSelectElement;
    task = target.value;
  }

  async function AddTask() {
    let id = uuidv4();
    formData.task = task;
    formData.id = id;
    formData.isCompleted = isCompleted;
    console.log(formData);
    await client.todo.create({ data: formData });

    allTodos = await client.todo.findMany([]);
  }

  async function deleteTask(id: String) {
    await client.todo.delete({
      where: {
        id: id,
      },
    });
    
    allTodos = await client.todo.findMany([]);
  }

  onMount(async () => {
    // Always instantiate on client-side (need IndexedDB)
    client = await PrismaIDBClient.create();
    allTodos = await client.todo.findMany([]);
  });
</script>

<main class="prose max-w-full">
  <div class="space-y-2">
    <Input type="text" placeholder="Enter task" class="max-w-xs" on:input={handleChange} />
    <button onclick={AddTask}>Add Task</button>
    <input type="checkbox" bind:checked={isCompleted} />Completed

    <!-- <button onclick={Read}>Fetch</button> -->
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-[100px]">Id</Table.Head>
          <Table.Head>Task</Table.Head>
          <Table.Head>Completed</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each allTodos as allTodo}
          <Table.Row>
            <Table.Cell>{allTodo.id}</Table.Cell>
            <Table.Cell>{allTodo.task}</Table.Cell>
            <Table.Cell>{allTodo.isCompleted}</Table.Cell>
            <Table.Cell><button onclick={() => deleteTask(allTodo.id)}>delete task</button></Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</main>

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table";
  import { PrismaIDBClient } from "$lib/prisma-idb/prisma-idb-client";
  import { ModeWatcher } from "mode-watcher";
  import { onMount } from "svelte";
  import type { Todo } from "@prisma/client";

  let client: PrismaIDBClient;
  let allTodos = $state<Todo[]>([]);
  let totalCompletedTodos = $state<number>(0);

  const formData = {
    task: "",
    isCompleted: false,
  };

  let task = $state("");

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    task = target.value;
  }

  async function addTask() {
    formData.task = task;
    await client.todo.create({ data: formData });
    allTodos = await client.todo.findMany();
    task = "";
  }

  async function countCompletedTodos() {
    totalCompletedTodos = await client.todo.count({
      where: {
        isCompleted: true,
      },
    });
  }
  async function updateStatus(id: string, event: Event) {
    const target = event.target as HTMLInputElement;
    await client.todo.update({
      where: { id: id },
      data: { isCompleted: target.checked },
    });
    countCompletedTodos();
    allTodos = await client.todo.findMany();
  }

  async function deleteTask(id: string) {
    await client.todo.delete({ where: { id: id } });
    allTodos = await client.todo.findMany();
  }

  onMount(async () => {
    // Always instantiate on client-side (need IndexedDB)
    client = await PrismaIDBClient.create();
    allTodos = await client.todo.findMany();
    countCompletedTodos();
  });
</script>

<div class="prose mt-5 flex max-w-full flex-col gap-5">
  <h1 class="text-center text-xl font-bold">Prisma-IDB usage page</h1>
  <div class="flex flex-col items-center space-y-4">
    <div class="flex items-center justify-center space-x-2">
      <Input type="text" placeholder="Enter Task" class="max-w-xs" bind:value={task} oninput={handleChange} />
      <Button variant="secondary" onclick={addTask}>Add Task</Button>
    </div>
    <div><h1 class="font-bold">Completed Tasks: {totalCompletedTodos}</h1></div>
  </div>
  <div>
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Task Id</Table.Head>
          <Table.Head>Task</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head>Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each allTodos as allTodo}
          <Table.Row class="w-fit">
            <Table.Cell>{allTodo.id}</Table.Cell>
            <Table.Cell>{allTodo.task}</Table.Cell>
            <Table.Cell>
              <input
                type="checkbox"
                bind:checked={allTodo.isCompleted}
                onchange={(event) => updateStatus(allTodo.id, event)}
              />
            </Table.Cell>
            <Table.Cell class="w-fit">
              <Button variant="destructive" onclick={() => deleteTask(allTodo.id)}>Delete Task</Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
  <ModeWatcher />
</div>

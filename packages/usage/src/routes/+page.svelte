<script lang="ts">
  import { onMount } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import { PrismaIDBClient } from "$lib/prisma-idb/prisma-idb-client";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button, Root } from "$lib/components/ui/button";
  import * as Table from "$lib/components/ui/table";
  import { ModeWatcher } from "mode-watcher";
  import TodosTable from "./(components)/TodosTable.svelte";

  let client: PrismaIDBClient;

  let allTodos = $state([{}]);

  let isCompleted = $state(false);

  const formData = {
    id: "",
    task: "",
    isCompleted: false,
  };

  let task = $state("");
  let id: String;

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    task = target.value;
  }
  

  async function AddTask() {
    let id = uuidv4();
    formData.task = task;
    formData.id = id;
    console.log(formData);
    await client.todo.create({ data: formData });
    allTodos = await client.todo.findMany([]);
    task = "";
  }


  async function updateStatus(id: string, event: Event) {
    const target = event.target as HTMLInputElement;
    let checked = target.checked;
    console.log(checked);
    let data = await client.todo.update({
      where: {
        id: id,
      },
      data: {
        isCompleted: checked,
      }
    });
    console.log(data);
    allTodos = await client.todo.findMany({});
    // console.log(allTodos);
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

<div class="prose mt-5 flex max-w-full flex-col gap-5">
  <h1 class="text-center font-bold">TODO</h1>
  <div class="flex items-center justify-center space-x-2">
    <Input type="text" placeholder="Enter Task" class="max-w-xs" bind:value={task} on:input={handleChange} />
    <Button variant="secondary" onclick={AddTask}>Add Task</Button>
  </div>
  <div>
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Task Id</Table.Head>
          <Table.Head>Task</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each allTodos as allTodo}
          <Table.Row class="w-fit">
            <Table.Cell>{allTodo.id}</Table.Cell>
            <Table.Cell>{allTodo.task}</Table.Cell>
            <Table.Cell><input type="checkbox" bind:checked={allTodo.isCompleted} onchange={(event) => {updateStatus(allTodo.id, event)}}/></Table.Cell>
            <Table.Cell class="w-fit text-right"
              ><Button variant="destructive" onclick={() => deleteTask(allTodo.id)}>Delete Task</Button></Table.Cell
            >
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
  <ModeWatcher />
</div>

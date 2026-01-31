<script lang="ts">
  import BlocksIcon from "@lucide/svelte/icons/blocks";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { page } from "$app/state";
  import NavUser from "./nav-user.svelte";
  import { resolve } from "$app/paths";
  import { getTodosContext } from "../todos-state.svelte";
  import { PlusIcon } from "@lucide/svelte";
  import NavSync from "./nav-sync.svelte";
  import PwaButton from "./pwa-button.svelte";

  const sidebar = Sidebar.useSidebar();
  const todosState = getTodosContext();

  const itemGroups = [
    {
      heading: "Application",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: BlocksIcon,
        },
      ],
    },
  ] as const;
</script>

<Sidebar.Root>
  <Sidebar.Content>
    <Sidebar.Group>
      {#each itemGroups as itemGroup (itemGroup.heading)}
        <Sidebar.GroupLabel>{itemGroup.heading}</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            {#each itemGroup.items as item (item.title)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={page.url.pathname.startsWith(item.url)}
                  onclick={() => sidebar.setOpenMobile(false)}
                >
                  {#snippet child({ props })}
                    <a href={resolve(item.url)} {...props}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      {/each}
    </Sidebar.Group>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Boards</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              data-testid="create-board-button"
              onclick={() => todosState.addBoard(`Board ${(todosState.boards?.length ?? 0) + 1}`)}
            >
              <PlusIcon />
              Create board
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer>
    <NavUser />
    <NavSync />
    <PwaButton />
  </Sidebar.Footer>
</Sidebar.Root>

<script lang="ts">
  import BlocksIcon from "@lucide/svelte/icons/blocks";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { page } from "$app/state";
  import NavUser from "./nav-user.svelte";
  import { resolve } from "$app/paths";
  import { BookOpenIcon, GithubIcon, PackageIcon } from "@lucide/svelte";
  import favicon from "$lib/assets/favicon.png";
  import NavSync from "./nav-sync.svelte";

  const sidebar = Sidebar.useSidebar();

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
  <Sidebar.Header>
    <Sidebar.MenuButton size="lg">
      {#snippet child({ props })}
        <a
          href={resolve("/")}
          {...props}
          class="bg-secondary hover:bg-secondary/80 flex items-center gap-2 rounded-md p-2"
        >
          <img src={favicon} alt="PIDB Kanban Logo" class="h-8 w-8" />
          <span class="font-semibold">PIDB Kanban</span>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.Header>
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
      <Sidebar.GroupLabel>External</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton>
              {#snippet child({ props })}
                <a
                  href="https://github.com/prisma-idb/idb-client-generator/"
                  {...props}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon />
                  GitHub repo
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton>
              {#snippet child({ props })}
                <a
                  href="https://github.com/prisma-idb/idb-client-generator/tree/main/apps/pidb-kanban-example"
                  {...props}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PackageIcon />
                  App source
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton>
              {#snippet child({ props })}
                <a
                  href="https://www.npmjs.com/package/@prisma-idb/idb-client-generator"
                  {...props}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 fill-current">
                    <path
                      d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"
                    />
                  </svg>
                  NPM package link
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton>
              {#snippet child({ props })}
                <a
                  href="https://idb-client-generator-docs.vercel.app/"
                  {...props}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpenIcon />
                  Package docs
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer>
    <NavSync />
    <NavUser />
  </Sidebar.Footer>
</Sidebar.Root>

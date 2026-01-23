<script lang="ts">
	import BlocksIcon from '@lucide/svelte/icons/blocks';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { page } from '$app/state';
	import NavUser from './nav-user.svelte';
	import { resolve } from '$app/paths';
	import { getTodosContext } from '../todos-state.svelte';
	import { PlusIcon } from '@lucide/svelte';

	const sidebar = Sidebar.useSidebar();
	const todosState = getTodosContext();

	const itemGroups = [
		{
			heading: 'Application',
			items: [
				{
					title: 'Dashboard',
					url: '/dashboard',
					icon: BlocksIcon
				}
			]
		}
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
							onclick={() => todosState.addBoard(`Board ${todosState.boards!.length + 1}`)}
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
	</Sidebar.Footer>
</Sidebar.Root>

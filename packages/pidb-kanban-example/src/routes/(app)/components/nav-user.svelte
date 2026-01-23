<script lang="ts">
	import { authClient } from '$lib/clients/auth-client';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import LoginIcon from '@lucide/svelte/icons/log-in';
	import UserIcon from '@lucide/svelte/icons/user';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const auth = authClient.useSession();
	let user = $derived($auth.data?.user);

	function getInitials(name: string) {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		{#if $auth.isPending}
			<Sidebar.MenuButton class="justify-center h-12">
				<Spinner />
			</Sidebar.MenuButton>
		{:else if !user}
			<Sidebar.MenuButton variant="outline" onclick={() => goto(resolve('/login'))}>
				<LoginIcon />
				Login
			</Sidebar.MenuButton>
		{:else}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Sidebar.MenuButton
							size="lg"
							class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							{...props}
						>
							<Avatar.Root class="size-8 rounded-lg">
								<Avatar.Image src={user.image} alt={user.name} />
								<Avatar.Fallback class="rounded-lg">
									{getInitials(user.name)}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">{user.name}</span>
								<span class="truncate text-xs">{user.email}</span>
							</div>
							<ChevronsUpDownIcon class="ms-auto size-4" />
						</Sidebar.MenuButton>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
					side="top"
					align="end"
					sideOffset={4}
				>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href={resolve('/profile')} {...props}>
								<UserIcon />
								Profile
							</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => authClient.signOut()}>
						<LogOutIcon />
						Log out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</Sidebar.MenuItem>
</Sidebar.Menu>

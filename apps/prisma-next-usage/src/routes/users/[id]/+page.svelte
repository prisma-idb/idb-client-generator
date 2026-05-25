<script lang="ts">
  import { onMount } from "svelte";
  import { PostsState } from "$lib/prisma/posts.svelte";
  import type { User } from "$lib/prisma/users.svelte";
  import { getDb } from "$lib/prisma/db";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import type { PageData } from "./$types";
  import { resolve } from "$app/paths";

  let { data }: { data: PageData } = $props();

  let user = $state<User | null>(null);
  let notFound = $state(false);
  let userLoading = $state(true);

  // Posts state is created once we know the user exists.
  let posts = $state<PostsState | null>(null);

  let title = $state("");
  let content = $state("");
  let submitting = $state(false);

  onMount(async () => {
    const db = await getDb(data.contract);
    const found = (await db.orm.users.findUnique(data.userId)) as User | null | undefined;
    if (!found) {
      notFound = true;
      userLoading = false;
      return;
    }
    user = found;
    userLoading = false;
    const p = new PostsState(data.contract, data.userId!);
    posts = p;
    await p.load();
  });

  async function addPost(event: SubmitEvent) {
    event.preventDefault();
    if (!posts) return;
    submitting = true;
    try {
      await posts.create(title.trim(), content.trim());
      title = "";
      content = "";
    } finally {
      submitting = false;
    }
  }
</script>

<main class="mx-auto max-w-2xl space-y-8 px-4 py-12">
  <a href={resolve("/")} class="text-muted-foreground hover:text-foreground inline-block text-sm">← All users</a>

  {#if userLoading}
    <p class="text-muted-foreground text-sm">Loading…</p>
  {:else if notFound}
    <Alert variant="destructive">
      <AlertTitle>User not found</AlertTitle>
      <AlertDescription>No user with ID <code>{data.userId}</code> exists in the database.</AlertDescription>
    </Alert>
  {:else if user}
    <div>
      <h1 class="text-3xl font-bold">{user.name}</h1>
      <p class="text-muted-foreground text-sm">{user.email}</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
        <CardDescription>Add a post for {user.name}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="add-post" onsubmit={addPost} class="space-y-4">
          <div class="space-y-1.5">
            <Label for="title">Title</Label>
            <Input id="title" bind:value={title} placeholder="My first post" required />
          </div>
          <div class="space-y-1.5">
            <Label for="content">Content</Label>
            <Input id="content" bind:value={content} placeholder="Hello, world!" required />
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="add-post" disabled={submitting}>
          {submitting ? "Adding…" : "Add post"}
        </Button>
      </CardFooter>
    </Card>

    {#if posts?.error}
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{posts.error}</AlertDescription>
      </Alert>
    {/if}

    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-semibold">Posts</h2>
        <Badge variant="secondary">{posts?.posts.length ?? 0}</Badge>
      </div>
      <Separator />

      {#if posts?.loading}
        <p class="text-muted-foreground text-sm">Loading…</p>
      {:else if !posts?.posts.length}
        <p class="text-muted-foreground text-sm">No posts yet.</p>
      {:else}
        <div class="space-y-2">
          {#each posts.posts as post (post.id)}
            <Card>
              <CardContent class="flex items-start justify-between py-4">
                <div class="flex-1">
                  <p class="font-medium">{post.title}</p>
                  <p class="text-muted-foreground mt-1 text-sm">{post.content}</p>
                </div>
                <Button variant="ghost" size="sm" onclick={() => posts?.remove(post.id)}>Delete</Button>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</main>

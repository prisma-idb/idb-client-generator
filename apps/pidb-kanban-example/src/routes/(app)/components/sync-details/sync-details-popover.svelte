<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { EllipsisIcon } from "@lucide/svelte";
  import PushTable from "./push-table.svelte";
  import PullTable from "./pull-table.svelte";
  import type { PushResult } from "$lib/prisma-idb/server/batch-processor";
  import type { ApplyPullResult } from "$lib/prisma-idb/client/apply-pull";
  import OutboxTable from "./outbox-table.svelte";

  type Props = {
    pushResult: { results: PushResult[] } | undefined;
    pullResult: ApplyPullResult | undefined;
    outboxStats: { unsynced: number; failed: number; lastError?: string } | undefined;
  };

  let { pushResult, pullResult, outboxStats }: Props = $props();
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" size="icon" {...props} aria-label="More info"><EllipsisIcon /></Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content side="right" align="end" class="w-96 rounded-lg border-0 p-0">
    <Card.Root>
      <Card.Header>
        <Card.Title>Sync details</Card.Title>
        <Card.Description>Status updates from the sync worker</Card.Description>
      </Card.Header>
      <Card.Content>
        <Tabs.Root value="push" class="w-full">
          <Tabs.List class="w-full grid-cols-3">
            <Tabs.Trigger value="push">Push</Tabs.Trigger>
            <Tabs.Trigger value="pull">Pull</Tabs.Trigger>
            <Tabs.Trigger value="outbox">Outbox</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="push">
            <PushTable {pushResult} />
          </Tabs.Content>
          <Tabs.Content value="pull">
            <PullTable {pullResult} />
          </Tabs.Content>
          <Tabs.Content value="outbox">
            <OutboxTable {outboxStats} />
          </Tabs.Content>
        </Tabs.Root>
      </Card.Content>
    </Card.Root>
  </Popover.Content>
</Popover.Root>

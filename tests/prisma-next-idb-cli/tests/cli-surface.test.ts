/**
 * CLI surface tests — help, unknown commands, no-arg invocation.
 *
 * The CLI is built on commander, mirroring `prisma-next`'s own `<group>
 * <verb>` shape — all migration-package commands live under a `migration`
 * group (`migration plan`, `migration contract-space`, `migration
 * preflight`).
 */

import { describe, expect, it } from "vitest";
import { cli, setupTmpProject } from "./_helpers";

describe("prisma-next-idb (CLI surface)", () => {
  it("`help` prints usage and lists the migration command group", async () => {
    const cwd = await setupTmpProject("cli-help");
    const { stdout, exitCode } = await cli(["help"], { cwd });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("prisma-next-idb");
    expect(stdout).toContain("migration");
  });

  it("`--help` is an alias for help", async () => {
    const cwd = await setupTmpProject("cli-dashhelp");
    const { stdout, exitCode } = await cli(["--help"], { cwd });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage");
  });

  it("no subcommand prints help and exits 0", async () => {
    const cwd = await setupTmpProject("cli-noargs");
    const { stdout, exitCode } = await cli([], { cwd });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("migration");
  });

  it("`migration --help` lists plan, contract-space, and preflight", async () => {
    const cwd = await setupTmpProject("cli-migration-help");
    const { stdout, exitCode } = await cli(["migration", "--help"], { cwd });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("plan");
    expect(stdout).toContain("contract-space");
    expect(stdout).toContain("preflight");
  });

  it("unknown top-level subcommand exits non-zero with an error", async () => {
    const cwd = await setupTmpProject("cli-unknown");
    const { stderr, exitCode } = await cli(["frobnicate"], { cwd });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("unknown command");
    expect(stderr).toContain("frobnicate");
  });

  it("unknown migration subcommand exits non-zero with an error", async () => {
    const cwd = await setupTmpProject("cli-unknown-migration-sub");
    const { stderr, exitCode } = await cli(["migration", "frobnicate"], { cwd });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("unknown command");
  });
});

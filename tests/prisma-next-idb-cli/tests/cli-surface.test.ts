/**
 * CLI surface tests — help, unknown commands, no-arg invocation.
 */

import { describe, expect, it } from "vitest";
import { cli, setupTmpProject } from "./_helpers";

describe("prisma-next-idb (CLI surface)", () => {
  it("`help` prints usage and exits 0", async () => {
    const cwd = await setupTmpProject("cli-help");
    const { stdout, exitCode } = await cli(["help"], { cwd });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("prisma-next-idb");
    expect(stdout).toContain("generate-contract-space");
    expect(stdout).toContain("preflight");
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
    expect(stdout).toContain("generate-contract-space");
  });

  it("unknown subcommand exits 2 with an error", async () => {
    const cwd = await setupTmpProject("cli-unknown");
    const { stderr, exitCode } = await cli(["frobnicate"], { cwd });
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Unknown command");
    expect(stderr).toContain("frobnicate");
  });
});

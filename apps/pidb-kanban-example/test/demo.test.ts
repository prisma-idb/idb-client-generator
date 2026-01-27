import { Cookie } from "@playwright/test";
import { expect, test } from "./fixtures";

function getCookie(sessionToken: string): Cookie {
  return {
    name: "__Secure-better-auth.session_token",
    value: sessionToken,
    domain: "localhost",
    path: "/",
    secure: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: true,
  };
}

test("syncs_create_update_delete_across_devices", async ({ user, browser }) => {
  const deviceA = await browser.newContext();
  deviceA.addCookies([getCookie(user.sessionToken)]);

  const pageA = await deviceA.newPage();
  await pageA.goto("/dashboard");

  const deviceB = await browser.newContext();
  deviceB.addCookies([getCookie(user.sessionToken)]);

  const pageB = await deviceB.newPage();
  await pageB.goto("/dashboard");

  // Device A: Create a new board
  await pageA.getByTestId("create-board-button").click();
  await pageA.getByTestId("board-menu-Board 1").click();
  await pageA.getByTestId("update-Board 1").click();
  await pageA.getByTestId(`rename-board-Board 1-input`).fill("Project Alpha");
  await pageA.getByTestId("rename-board-Board 1-submit").click();
  await expect(pageA.getByText("Project Alpha")).toBeVisible();

  // Device A: Sync changes
  await pageA.getByTestId("open-sync-menu").click();
  await pageA.getByTestId("sync-now-button").click();
  await expect(pageA.getByTestId("open-sync-menu")).toContainText("Stopped");

  // Device B: Sync changes and verify the new board appears
  await pageB.getByTestId("open-sync-menu").click();
  await pageB.getByTestId("sync-now-button").click();
  await expect(pageB.getByText("Project Alpha")).toBeVisible();

  // Device B: Update the board name
  await pageB.getByTestId("board-menu-Project Alpha").click();
  await pageB.getByTestId("update-Project Alpha").click();
  await pageB.getByTestId(`rename-board-Project Alpha-input`).fill("Project Beta");
  await pageB.getByTestId("rename-board-Project Alpha-submit").click();
  await expect(pageB.getByText("Project Beta")).toBeVisible();

  // Device B: Sync changes
  await pageB.getByTestId("open-sync-menu").click();
  await pageB.getByTestId("sync-now-button").click();
  await expect(pageB.getByTestId("open-sync-menu")).toContainText("Stopped");

  // Device A: Sync changes and verify the updated board name appears
  await pageA.getByTestId("open-sync-menu").click();
  await pageA.getByTestId("sync-now-button").click();
  await expect(pageA.getByText("Project Beta")).toBeVisible();

  // Device A: Delete the board
  await pageA.getByTestId("board-menu-Project Beta").click();
  await pageA.getByTestId("update-Project Beta").click();
  await pageA.getByTestId("delete-board-Project Beta").click();
  await expect(pageA.getByText("Project Beta").first()).not.toBeVisible();

  // Device A: Sync changes
  await pageA.getByTestId("open-sync-menu").click();
  await pageA.getByTestId("sync-now-button").click();
  await expect(pageA.getByTestId("open-sync-menu")).toContainText("Stopped");

  // Device B: Sync changes and verify the board is deleted
  await pageB.getByTestId("open-sync-menu").click();
  await pageB.getByTestId("sync-now-button").click();
  await expect(pageB.getByText("Project Beta")).not.toBeVisible();
});

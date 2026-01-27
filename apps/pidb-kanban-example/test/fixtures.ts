import { test as base, type Cookie, expect, Page } from "@playwright/test";
import { prisma } from "./prisma";

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

export const test = base.extend<{ pages: [Page, Page] }>({
  pages: [
    async ({ page, context, browser }, use) => {
      await page.goto("/login");
      await page.getByText("Sign in anonymously").click();
      await expect(page.getByTestId("user-email")).toContainText("temp");

      const userEmail = await page.getByTestId("user-email").innerText();
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((cookie) => cookie.name === "__Secure-better-auth.session_token");

      if (!sessionCookie) {
        throw new Error("Session cookie not found");
      }

      const deviceA = await browser.newContext();
      await deviceA.addCookies([getCookie(sessionCookie.value)]);

      const pageA = await deviceA.newPage();
      await pageA.goto("/dashboard");

      const deviceB = await browser.newContext();
      await deviceB.addCookies([getCookie(sessionCookie.value)]);

      const pageB = await deviceB.newPage();
      await pageB.goto("/dashboard");

      await use([pageA, pageB]);

      await prisma.user.delete({ where: { email: userEmail } });
    },
    { scope: "test" },
  ],
});

export { expect } from "@playwright/test";

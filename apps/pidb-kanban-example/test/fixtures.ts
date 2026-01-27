import { test as base, expect } from "@playwright/test";
import { prisma } from "./prisma";

// Define the type for the user object
type User = {
  name: string;
  sessionToken: string;
};

export const test = base.extend<{ user: User }>({
  user: [
    async ({ page, context }, use) => {
      await page.goto("/login");
      await page.getByText("Sign in anonymously").click();
      await expect(page.getByTestId("user-email")).toContainText("temp");

      const userEmail = await page.getByTestId("user-email").innerText();
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((cookie) => cookie.name === "__Secure-better-auth.session_token");

      if (!sessionCookie) {
        throw new Error("Session cookie not found");
      }

      const newUser: User = {
        name: userEmail,
        sessionToken: sessionCookie.value,
      };

      await use(newUser);

      await prisma.user.deleteMany();
    },
    { scope: "test" },
  ],
});

export { expect } from "@playwright/test";

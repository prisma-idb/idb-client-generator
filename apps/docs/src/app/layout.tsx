import { GeistSans } from "geist/font/sans";
import { Provider } from "@/components/provider";
import { Analytics } from "@vercel/analytics/next";
import "./global.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "IDB Client Generator Docs",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={GeistSans.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
        <Analytics />
      </body>
    </html>
  );
}

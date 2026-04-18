import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Prisma IDB Benchmark Lab",
  description: "Run local browser benchmarks for Prisma IDB generated clients.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("dark", GeistSans.className, GeistMono.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}

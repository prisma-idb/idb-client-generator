import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Favicon from "./assets/favicon.png";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src={Favicon} alt="Prisma IDB Favicon" height={36} />
          Prisma IDB
        </>
      ),
    },
  };
}

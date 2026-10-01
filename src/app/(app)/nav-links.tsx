"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/bank", label: "Your Bank" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-4 text-sm">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "transition-colors hover:text-foreground",
            pathname.startsWith(href) ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

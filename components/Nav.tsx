// components/Nav.tsx
// Shared top nav. Without this the new pages are unreachable — the root
// redirects to /larvae and nothing links onward.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const INK = "#1e2a3a";
const CORAL = "#e8604c";

const LINKS = [
  { href: "/larvae", label: "Specimens" },
  { href: "/map", label: "Map" },
  { href: "/credibility", label: "Track Record" },
  { href: "/election", label: "Election" },
  { href: "/larvae-survey", label: "Survey Game" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="mb-8 flex flex-wrap gap-1 border-b pb-3" style={{ borderColor: `${INK}15` }}>
      {LINKS.map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity"
            style={{
              color: active ? CORAL : INK,
              background: active ? `${CORAL}12` : "transparent",
              opacity: active ? 1 : 0.55,
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

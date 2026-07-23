// components/Nav.tsx
// Shared top nav. Without this the new pages are unreachable — the root
// redirects to /larvae and nothing links onward.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

const LINKS = [
  { href: "/larvae", label: "Specimens" },
  { href: "/map", label: "Map" },
  { href: "/credibility", label: "Track Record" },
  { href: "/election", label: "Election" },
  { href: "/larvae-survey", label: "Survey Game" },
];

export default function Nav() {
  const path = usePathname();
  const { dark, toggle, colors } = useTheme();
  const { ink, coral } = colors;

  return (
    <nav className="mb-8 flex flex-wrap items-center gap-1 border-b pb-3" style={{ borderColor: `${ink}15` }}>
      {LINKS.map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity"
            style={{
              color: active ? coral : ink,
              background: active ? `${coral}12` : "transparent",
              opacity: active ? 1 : 0.55,
            }}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={toggle}
        className="ml-auto rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-100"
        style={{
          borderColor: `${ink}22`,
          color: ink,
          opacity: 0.65,
          background: "transparent",
        }}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? "Light" : "Dark"}
      </button>
    </nav>
  );
}

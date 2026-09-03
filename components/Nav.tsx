// components/Nav.tsx
// Shared top nav. Without this the new pages are unreachable — the root
// redirects to /larvae and nothing links onward.
//
// Desktop (md+): field-guide chips + Games dropdown + theme.
// Mobile (max-md): current page + Menu + theme; drawer with sectioned rows.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

type NavLink = { href: string; label: string };

const FIELD: NavLink[] = [
  { href: "/larvae", label: "Specimens" },
  { href: "/map", label: "Map" },
  { href: "/credibility", label: "Track Record" },
  { href: "/moral", label: "Moral Test" },
  { href: "/reception", label: "Reception" },
  { href: "/governance", label: "Governance" },
  { href: "/trends", label: "Topic Trends" },
  { href: "/notable", label: "Notable Posts" },
  { href: "/lobsters", label: "Clawd Incarnate" },
  { href: "/pepe", label: "Pepe Incarnate" },
  { href: "/about", label: "About" },
];

const GAMES: NavLink[] = [
  { href: "/standup", label: "Stand-Up" },
  { href: "/larvae-survey", label: "Survey Game" },
  { href: "/hive-shark", label: "Hive Shark" },
  { href: "/debate", label: "Debate" },
];

const ALL = [...FIELD, ...GAMES];

function chipStyle(active: boolean, ink: string, coral: string) {
  return {
    color: active ? coral : ink,
    background: active ? `${coral}12` : "transparent",
    opacity: active ? 1 : 0.55,
  } as const;
}

export default function Nav() {
  const path = usePathname();
  const { dark, toggle, colors } = useTheme();
  const { ink, coral } = colors;
  const [open, setOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const gamesRef = useRef<HTMLDivElement>(null);

  const current = ALL.find((l) => l.href === path)?.label || "Menu";
  const gamesActive = GAMES.some((l) => l.href === path);

  useEffect(() => {
    setOpen(false);
    setGamesOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!gamesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!gamesRef.current?.contains(e.target as Node)) setGamesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGamesOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [gamesOpen]);

  const themeBtn = (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-100 max-md:min-h-11 max-md:px-4 max-md:text-[11px]"
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
  );

  return (
    <nav className="mb-8 border-b pb-3 max-md:mb-5 max-md:pb-2" style={{ borderColor: `${ink}15` }}>
      {/* Desktop */}
      <div className="hidden flex-wrap items-center gap-1 md:flex">
        {FIELD.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity"
              style={chipStyle(active, ink, coral)}
            >
              {l.label}
            </Link>
          );
        })}

        <div className="relative" ref={gamesRef}>
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-opacity"
            style={chipStyle(gamesActive || gamesOpen, ink, coral)}
            aria-expanded={gamesOpen}
            aria-haspopup="menu"
          >
            Games {gamesOpen ? "▴" : "▾"}
          </button>
          {gamesOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 min-w-[10.5rem] rounded-lg border py-1 shadow-lg"
              style={{
                background: dark ? "#151b22" : "#fff",
                borderColor: `${ink}18`,
              }}
            >
              {GAMES.map((l) => {
                const active = path === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    role="menuitem"
                    onClick={() => setGamesOpen(false)}
                    className="block px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
                    style={{
                      color: active ? coral : ink,
                      background: active ? `${coral}12` : "transparent",
                    }}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto">{themeBtn}</div>
      </div>

      {/* Mobile bar */}
      <div className="flex items-center gap-2 md:hidden">
        <p
          className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-widest"
          style={{ color: coral }}
        >
          {current}
        </p>
        {themeBtn}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-md border px-4 font-mono text-[11px] uppercase tracking-widest"
          style={{ borderColor: `${ink}22`, color: ink, background: "transparent" }}
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-nav-drawer"
            className="safe-area-pad absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t px-4 pb-6 pt-4 shadow-xl"
            style={{ background: dark ? "#151b22" : "#fff", borderColor: `${ink}18` }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-widest opacity-50">Navigate</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-md px-3 font-mono text-[11px] uppercase tracking-widest opacity-60"
                style={{ color: ink }}
              >
                Close
              </button>
            </div>

            <p className="mb-1 px-4 font-mono text-[10px] uppercase tracking-widest opacity-40">
              Field guide
            </p>
            <div className="mb-4 flex flex-col gap-1">
              {FIELD.map((l) => {
                const active = path === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center rounded-lg px-4 font-mono text-xs uppercase tracking-widest"
                    style={{
                      color: active ? coral : ink,
                      background: active ? `${coral}14` : "transparent",
                    }}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>

            <p className="mb-1 px-4 font-mono text-[10px] uppercase tracking-widest opacity-40">
              Games
            </p>
            <div className="flex flex-col gap-1">
              {GAMES.map((l) => {
                const active = path === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center rounded-lg px-4 font-mono text-xs uppercase tracking-widest"
                    style={{
                      color: active ? coral : ink,
                      background: active ? `${coral}14` : "transparent",
                    }}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

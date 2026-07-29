"use client";

import type { ReactNode } from "react";

/** Cute mini judge bench — larva sits behind a wood desk + nameplate. */
export default function JudgeDesk({
  avatar,
  name,
  subtitle,
  children,
  talking,
  ink,
  gold,
}: {
  avatar: ReactNode;
  name: string;
  subtitle?: string;
  children?: ReactNode;
  talking?: boolean;
  ink: string;
  gold: string;
}) {
  const wood = "#c4a574";
  const woodDeep = "#8b6914";
  const woodEdge = "#6b4f1d";

  return (
    <div
      className="relative flex flex-col items-center rounded-xl px-2 pb-2 pt-3"
      style={{
        background: talking ? `${gold}14` : "transparent",
        outline: talking ? `1px solid ${gold}55` : "none",
      }}
    >
      <div className="relative z-10">{avatar}</div>

      {/* Desk top + body */}
      <div className="relative z-20 -mt-1 w-full min-w-[7.5rem] max-w-[11rem]">
        <div
          className="h-2.5 rounded-t-md shadow-sm"
          style={{
            background: `linear-gradient(180deg, ${wood} 0%, ${woodDeep} 100%)`,
            border: `1px solid ${woodEdge}`,
            borderBottom: "none",
          }}
        />
        <div
          className="rounded-b-lg px-2 pb-2 pt-1.5"
          style={{
            background: `linear-gradient(180deg, ${woodDeep} 0%, #5c4218 100%)`,
            border: `1px solid ${woodEdge}`,
            borderTop: "none",
          }}
        >
          <div
            className="mx-auto mb-1 w-fit rounded px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-white"
            style={{ background: gold }}
          >
            Judge
          </div>
          <p className="truncate text-center text-xs font-semibold" style={{ color: "#f5efe4" }}>
            {name}
          </p>
          {subtitle ? (
            <p
              className="mt-0.5 truncate text-center font-mono text-[9px] uppercase tracking-widest"
              style={{ color: `${"#f5efe4"}99` }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Tiny gavel on the desk corner */}
        <svg
          aria-hidden
          className="absolute -right-1 top-0"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          style={{ transform: "rotate(28deg)" }}
        >
          <rect x="8" y="7" width="2.2" height="9" rx="1" fill="#5c4218" />
          <rect x="4" y="4" width="10" height="4.2" rx="1.2" fill="#8b6914" stroke="#5c4218" strokeWidth="0.6" />
          <rect x="3" y="14.5" width="8" height="1.8" rx="0.6" fill="#6b4f1d" />
        </svg>
      </div>

      {children ? (
        <div className="mt-2 w-full text-center text-[11px] leading-snug opacity-80" style={{ color: ink }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

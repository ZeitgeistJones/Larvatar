// Pure EasyDamus geometry helpers (safe for client components).

export function moralMapCoords(r: {
  lawChaos: number;
  goodEvil: number;
  scores?: {
    lx: number;
    nx: number;
    cx: number;
    xg: number;
    xn: number;
    xe: number;
  };
}): { x: number; y: number } {
  if (r.scores) {
    const { lx, nx, cx, xg, xn, xe } = r.scores;
    const lawT = lx + nx + cx || 1;
    const goodT = xg + xn + xe || 1;
    return {
      x: (cx - lx) / lawT,
      y: (xe - xg) / goodT,
    };
  }
  return { x: r.lawChaos / 2, y: r.goodEvil / 2 };
}

/** How deep in the winning box vs sitting on a border (0 = dead center / tie-ish). */
export function moralMargin(r: {
  scores?: {
    lx: number;
    nx: number;
    cx: number;
    xg: number;
    xn: number;
    xe: number;
  };
}): number {
  if (!r.scores) return 0;
  const { lx, nx, cx, xg, xn, xe } = r.scores;
  const combos = [
    lx + xg,
    nx + xg,
    cx + xg,
    lx + xn,
    nx + xn,
    cx + xn,
    lx + xe,
    nx + xe,
    cx + xe,
  ].sort((a, b) => b - a);
  return Math.max(0, combos[0] - (combos[1] ?? 0));
}

const fs = require("fs");
const d = JSON.parse(
  fs.readFileSync(
    "C:/Users/vtanc/.cursor/projects/c-dev-Larvatar/agent-tools/9ab1b469-a2ee-40e5-b5df-6231a0f5f5b0.txt",
    "utf8"
  )
);
const p = d.post;
console.log({
  id: p.id,
  title: p.title,
  created_at: p.created_at,
  larva_triggered: p.larva_triggered,
  cv_burned: p.cv_burned,
  total_cv: p.total_cv,
  larvaResponseCount: d.larvaResponseCount,
  larvaPendingCount: d.larvaPendingCount,
  hasAgg: Boolean(p.aggregated_opinion),
  aggShort: p.aggregated_opinion_short,
  aggLen: (p.aggregated_opinion || "").length,
});

// response time span
const times = d.larvaResponses.map((r) => new Date(r.created_at).getTime()).sort();
console.log({
  firstResponse: new Date(times[0]).toISOString(),
  lastResponse: new Date(times[times.length - 1]).toISOString(),
  spanMinutes: Math.round((times[times.length - 1] - times[0]) / 60000),
});

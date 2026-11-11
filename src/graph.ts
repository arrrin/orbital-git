import type { Commit } from "./types";
export const colors = [
  "#b9a0ff",
  "#62d8b1",
  "#6fb7ff",
  "#f0b76c",
  "#ec91c3",
  "#a7c96a",
];
export function layoutGraph(commits: Commit[]) {
  const lanes: string[] = [];
  const nodes: { hash: string; lane: number; row: number; color: string }[] =
    [];
  const pending: { from: string; to: string; color: string }[] = [];
  const colorMap = new Map<string, string>();
  commits.forEach((commit, row) => {
    let lane = lanes.indexOf(commit.hash);
    if (lane < 0) {
      lane = lanes.indexOf("");
      if (lane < 0) lane = lanes.length;
      lanes[lane] = commit.hash;
    }
    const color = colorMap.get(commit.hash) ?? colors[lane % colors.length];
    nodes.push({ hash: commit.hash, lane, row, color });
    lanes[lane] = "";
    commit.parents.forEach((parent, index) => {
      if (!lanes.includes(parent)) {
        let slot = index === 0 && lanes[lane] === "" ? lane : lanes.indexOf("");
        if (slot < 0) slot = lanes.length;
        lanes[slot] = parent;
      }
      if (!colorMap.has(parent))
        colorMap.set(
          parent,
          index === 0 ? color : colors[lanes.indexOf(parent) % colors.length],
        );
      pending.push({
        from: commit.hash,
        to: parent,
        color: index === 0 ? color : colorMap.get(parent)!,
      });
    });
  });
  const map = new Map(nodes.map((n) => [n.hash, n]));
  return {
    nodes,
    width: Math.max(100, Math.max(0, ...nodes.map((n) => n.lane)) * 22 + 48),
    edges: pending.flatMap((edge) => {
      const a = map.get(edge.from),
        b = map.get(edge.to);
      if (!a || !b) return [];
      const x1 = 22 + a.lane * 22,
        x2 = 22 + b.lane * 22,
        y1 = a.row * 46 + 23,
        y2 = b.row * 46 + 23;
      return [
        {
          ...edge,
          d:
            x1 === x2
              ? `M${x1} ${y1} V${y2}`
              : `M${x1} ${y1} C${x1} ${y1 + 25},${x2} ${y2 - 25},${x2} ${y2}`,
        },
      ];
    }),
  };
}

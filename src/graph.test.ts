import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graph";
import type { Commit } from "./types";
const c = (hash: string, parents: string[]): Commit => ({
  hash,
  parents,
  author: "A",
  email: "a@b.c",
  date: "2026-01-01",
  subject: hash,
  refs: [],
});
describe("commit graph", () => {
  it("keeps linear history in one lane", () => {
    const graph = layoutGraph([c("a", ["b"]), c("b", ["c"]), c("c", [])]);
    expect(graph.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    expect(graph.edges).toHaveLength(2);
  });
  it("separates both merge parents and joins their shared ancestor", () => {
    const graph = layoutGraph([
      c("merge", ["a", "b"]),
      c("a", ["root"]),
      c("b", ["root"]),
      c("root", []),
    ]);
    expect(graph.nodes[1].lane).not.toBe(graph.nodes[2].lane);
    expect(graph.edges).toHaveLength(4);
    expect(graph.edges.filter((e) => e.to === "root")).toHaveLength(2);
  });
  it("handles disconnected roots and truncated history without dangling paths", () => {
    const graph = layoutGraph([c("a", ["missing"]), c("root", [])]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([]);
    expect(layoutGraph([]).width).toBe(100);
  });
});

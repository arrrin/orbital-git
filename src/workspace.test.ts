import { describe, it, expect } from "vitest";
import { normalizeWorkspace } from "./workspace";
describe("workspace migration", () => {
  it("restores existing groups and assignments", () => {
    expect(
      normalizeWorkspace({
        groups: ["Work"],
        repos: [{ path: "D:/repo", name: "repo", group: "Work" }],
      }),
    ).toEqual({
      groups: ["Work"],
      repos: [{ path: "D:/repo", name: "repo", group: "Work" }],
    });
  });
  it("keeps flat workspace repos and creates a default group", () => {
    expect(
      normalizeWorkspace({ repos: [{ path: "D:/repo", name: "repo" }] }),
    ).toEqual({
      groups: ["Workspace"],
      repos: [{ path: "D:/repo", name: "repo", group: "Workspace" }],
    });
  });
});

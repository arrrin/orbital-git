import type { Snapshot, Workspace } from "./types";
const hashes = Array.from({ length: 30 }, (_, i) =>
  (0xa7f91e2 - i * 27181).toString(16).padEnd(40, "0"),
);
const subjects = [
  "Refine repository sidebar and branch indicators",
  "Merge branch 'feature/worktrees' into main",
  "Add worktree creation flow and directory picker",
  "Improve graph lane rendering for merge commits",
  "Handle empty repositories gracefully",
  "Merge branch 'fix/diff-view' into main",
  "Add keyboard shortcuts and command palette",
  "Fix line numbers in unified diff viewer",
  "Persist workspace groups across sessions",
  "Add VS Code integration for file diffs",
  "Update color tokens for better contrast",
  "Optimize commit history pagination",
  "Add branch comparison and merge preview",
  "Show ahead / behind status for tracked branches",
  "Implement stash management",
  "Add repository search and quick switcher",
  "Improve error messages for failed Git operations",
  "Add loading states to repository actions",
  "Set up continuous integration",
  "Initial project structure",
];
export const demoWorkspace: Workspace = {
  groups: ["Workspace", "Open source"],
  repos: [
    { name: "orbital", path: "/demo/orbital", group: "Workspace" },
    { name: "design-system", path: "/demo/design-system", group: "Workspace" },
    { name: "api-service", path: "/demo/api-service", group: "Workspace" },
    { name: "rust-utils", path: "/demo/rust-utils", group: "Open source" },
  ],
};
export function demoSnapshot(path = "/demo/orbital"): Snapshot {
  return {
    path,
    branch: path.includes("design") ? "feature/tokens" : "main",
    upstream: "origin/main",
    ahead: 2,
    behind: 0,
    operation: "",
    files: [
      {
        path: "src/components/RepositorySidebar.tsx",
        index: " ",
        worktree: "M",
        conflict: false,
      },
      {
        path: "src/styles/tokens.css",
        index: "M",
        worktree: " ",
        conflict: false,
      },
      {
        path: "src/components/WorktreeDialog.tsx",
        index: "?",
        worktree: "?",
        conflict: false,
      },
    ],
    commits: subjects.map((subject, i) => ({
      hash: hashes[i],
      parents:
        i === 1
          ? [hashes[3], hashes[2]]
          : i === 2
            ? [hashes[4]]
            : i === 5
              ? [hashes[6], hashes[7]]
              : i === 7
                ? [hashes[9]]
                : i < subjects.length - 1
                  ? [hashes[i + 1]]
                  : [],
      author: i % 4 === 2 ? "Alex Morgan" : i % 4 === 1 ? "Jamie Chen" : "You",
      email: "developer@example.com",
      date: new Date(Date.now() - i * 3600_000 * 3).toISOString(),
      subject,
      refs:
        i === 0
          ? ["HEAD -> main", "origin/main"]
          : i === 2
            ? ["feature/worktrees"]
            : i === 7
              ? ["fix/diff-view"]
              : i === 11
                ? ["tag: v0.1.0"]
                : [],
    })),
    branches: [
      { name: "main", current: true, upstream: "origin/main" },
      { name: "feature/worktrees", current: false, upstream: "" },
      { name: "fix/diff-view", current: false, upstream: "" },
      { name: "origin/main", current: false, upstream: "" },
    ],
    worktrees: [
      { path, branch: "main", head: hashes[0] },
      {
        path: "/demo/orbital-worktrees/feature-worktrees",
        branch: "feature/worktrees",
        head: hashes[2],
      },
    ],
    stashes: ["stash@{0}: On main: WIP: command palette improvements"],
    remotes: ["origin  git@github.com:you/orbital.git (fetch)"],
    tags: ["v0.1.0"],
  };
}

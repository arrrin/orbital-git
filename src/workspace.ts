import type { Workspace } from "./types";
export function normalizeWorkspace(value: unknown): Workspace {
  const raw = value as Partial<Workspace>;
  const repos = (Array.isArray(raw?.repos) ? raw.repos : [])
    .filter(
      (r) => r && typeof r.path === "string" && typeof r.name === "string",
    )
    .map((r) => ({
      ...r,
      group:
        typeof r.group === "string" && r.group.trim() ? r.group : "Workspace",
    }));
  const groups = [
    ...new Set([
      ...(Array.isArray(raw?.groups)
        ? raw.groups.filter((g) => typeof g === "string" && g.trim())
        : []),
      ...repos.map((r) => r.group),
    ]),
  ];
  return { repos, groups: groups.length ? groups : ["Workspace"] };
}

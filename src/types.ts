export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  refs: string[];
}
export interface FileStatus {
  path: string;
  index: string;
  worktree: string;
  conflict: boolean;
}
export interface Branch {
  name: string;
  current: boolean;
  upstream: string;
  remote?: boolean;
}
export interface Worktree {
  path: string;
  branch: string;
  head: string;
}
export interface Snapshot {
  path: string;
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  files: FileStatus[];
  commits: Commit[];
  branches: Branch[];
  worktrees: Worktree[];
  stashes: string[];
  remotes: string[];
  tags: string[];
  operation: string;
  head: string;
}
export type WorkingState = Pick<
  Snapshot,
  "branch" | "upstream" | "ahead" | "behind" | "files" | "operation" | "head"
>;
export interface Repo {
  path: string;
  name: string;
  group: string;
}
export interface Workspace {
  repos: Repo[];
  groups: string[];
}

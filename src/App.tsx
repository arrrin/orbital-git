import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Blocks,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Command,
  Copy,
  FileCode2,
  Folder,
  FolderGit2,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitMerge,
  Github,
  Layers,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, desktop } from "./api";
import packageInfo from "../package.json";
import { layoutGraph } from "./graph";
import type { Commit, FileStatus, Repo, Snapshot, Workspace } from "./types";

type Tab = "graph" | "changes" | "worktrees" | "stashes";
type Modal = { kind: string; title: string; value?: string };
const short = (s: string) => s.slice(0, 7);
const basename = (s: string) =>
  s.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? s;
const staged = (f: FileStatus) => ![" ", "?"].includes(f.index);
function relative(date: string) {
  const h = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 3600000));
  return h < 1
    ? "just now"
    : h < 24
      ? `${h}h ago`
      : `${Math.floor(h / 24)}d ago`;
}
function IconButton({
  children,
  onClick,
  title,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>({
    repos: [],
    groups: [],
  });
  const [active, setActive] = useState("");
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [tab, setTab] = useState<Tab>("graph");
  const [selected, setSelected] = useState<Commit | null>(null);
  const [query, setQuery] = useState("");
  const [repoQuery, setRepoQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState("");
  const [fileStaged, setFileStaged] = useState(false);
  const [patch, setPatch] = useState("");
  const [commitFiles, setCommitFiles] = useState<string[]>([]);
  const [palette, setPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [comparison, setComparison] = useState("");
  const data = snapshots[active];
  const repo = workspace.repos.find((r) => r.path === active);
  const activeRef = useRef(active);
  activeRef.current = active;
  const mounted = useRef(true);
  const lock = useRef(false);
  const diffGeneration = useRef(0);
  useEffect(() => {
    if (!modal && !palette) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea',
        ),
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [!!modal, palette]);
  useEffect(() => {
    mounted.current = true;
    api
      .load()
      .then((w) => {
        if (!mounted.current) return;
        setWorkspace(w);
        setActive(w.repos[0]?.path ?? "");
        setReady(true);
      })
      .catch((e) => {
        setError(String(e));
        setReady(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async (path: string) => {
    if (!path) return;
    const next = await api.snapshot(path);
    if (mounted.current) setSnapshots((s) => ({ ...s, [path]: next }));
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const update = async () => {
      for (const r of workspace.repos) {
        if (cancelled) return;
        try {
          await refresh(r.path);
        } catch (e) {
          if (!cancelled && r.path === activeRef.current) setError(String(e));
        }
      }
    };
    void update();
    const timer = setInterval(() => {
      if (!lock.current) void update();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workspace.repos, ready, refresh]);
  useEffect(() => {
    setSelected(null);
    setFile("");
    setPatch("");
    setTab("graph");
    setBranchFilter("all");
    setQuery("");
    setError("");
  }, [active]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setComparison("");
    if (modal?.kind !== "merge" || !form.value) return;
    let cancelled = false;
    if (!desktop) {
      setComparison("Preview is available in the desktop app.");
      return;
    }
    api
      .execute(active, "compare", [form.value])
      .then((result) => {
        if (cancelled) return;
        const [ahead, behind] = result.trim().split(/\s+/);
        setComparison(
          `${behind} commits to bring in · ${ahead} commits unique to ${data?.branch ?? "current branch"}`,
        );
      })
      .catch((e) => {
        if (!cancelled) setComparison(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [modal?.kind, form.value, active, data?.branch]);
  const run = useCallback(
    async (action: string, args: string[] = [], path = active) => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(action);
      setError("");
      try {
        const result = await api.execute(path, action, args);
        if (action !== "clone") await refresh(path);
        setToast(result || "Repository updated");
        return true;
      } catch (e) {
        setError(String(e));
        await refresh(path).catch(() => {});
        return false;
      } finally {
        lock.current = false;
        setBusy("");
      }
    },
    [active, refresh],
  );
  const save = async (w: Workspace) => {
    try {
      await api.save(w);
      setWorkspace(w);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  const addRepo = async (
    path: string,
    group = workspace.groups[0] ?? "Workspace",
  ) => {
    try {
      const snapshot = await api.snapshot(path);
      const existing = workspace.repos.find(
        (r) => r.path.toLowerCase() === snapshot.path.toLowerCase(),
      );
      if (existing) {
        setActive(existing.path);
        return;
      }
      const next = {
        ...workspace,
        groups: workspace.groups.includes(group)
          ? workspace.groups
          : [...workspace.groups, group],
        repos: [
          ...workspace.repos,
          { path: snapshot.path, name: basename(snapshot.path), group },
        ],
      };
      if (await save(next)) {
        setSnapshots((s) => ({ ...s, [snapshot.path]: snapshot }));
        setActive(snapshot.path);
        setModal(null);
      }
    } catch (e) {
      setError(String(e));
    }
  };
  const pick = async () => {
    if (!desktop) {
      setError("Open Orbital as a desktop app to choose a local repository.");
      return;
    }
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: "Open a Git repository",
      });
      if (typeof path === "string") await addRepo(path);
    } catch (e) {
      setError(String(e));
    }
  };
  const showModal = (kind: string, title: string, value?: string) => {
    setForm({});
    setModal({ kind, title, value });
  };
  const showFile = async (
    name: string,
    isStaged = false,
    revision: string | null = null,
  ) => {
    const gen = ++diffGeneration.current;
    setFile(name);
    setFileStaged(isStaged);
    setPatch("Loading diff…");
    try {
      const result = await api.diff(active, name, revision, isStaged);
      if (gen === diffGeneration.current)
        setPatch(
          result || "No text changes. This may be a binary file or a rename.",
        );
    } catch (e) {
      if (gen === diffGeneration.current) setPatch(String(e));
    }
  };
  const chooseCommit = async (c: Commit) => {
    setSelected(c);
    setFile("");
    setPatch("");
    setCommitFiles([]);
    const gen = ++diffGeneration.current;
    try {
      const result = desktop
        ? await api.execute(active, "commit-files", [c.hash])
        : "src/components/RepositorySidebar.tsx\0src/styles/tokens.css";
      if (gen === diffGeneration.current)
        setCommitFiles([...new Set(result.split("\0").filter(Boolean))]);
    } catch (e) {
      if (gen === diffGeneration.current) setError(String(e));
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setModal(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        void refresh(active).catch((e) => setError(String(e)));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, refresh]);
  const commits = useMemo(() => {
    let list = data?.commits ?? [];
    if (branchFilter !== "all") {
      const start = list.find((c) =>
        c.refs.some(
          (r) => r === branchFilter || r === `HEAD -> ${branchFilter}`,
        ),
      );
      const ancestors = new Set<string>();
      const byHash = new Map(list.map((c) => [c.hash, c]));
      const visit = (hash: string) => {
        if (ancestors.has(hash)) return;
        ancestors.add(hash);
        byHash.get(hash)?.parents.forEach(visit);
      };
      if (start) visit(start.hash);
      list = list.filter((c) => ancestors.has(c.hash));
    }
    return list.filter((c) =>
      `${c.subject} ${c.author} ${c.hash} ${c.refs.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  }, [data, query, branchFilter]);
  const graph = useMemo(() => layoutGraph(commits), [commits]);
  const localBranches =
    data?.branches.filter((b) => !(b.remote ?? b.name.startsWith("origin/"))) ??
    [];
  const submitModal = async () => {
    if (!modal) return;
    const value = form.value?.trim() ?? "";
    if (modal.kind === "group") {
      if (
        value &&
        !workspace.groups.includes(value) &&
        (await save({ ...workspace, groups: [...workspace.groups, value] }))
      )
        setModal(null);
      return;
    }
    if (modal.kind === "add") {
      await addRepo(value, form.group || workspace.groups[0]);
      return;
    }
    if (modal.kind === "init") {
      if (await run("init", [], value))
        await addRepo(value, form.group || workspace.groups[0]);
      return;
    }
    if (modal.kind === "remote") {
      if (await run("remote-add", [form.name || "origin", value]))
        setModal(null);
      return;
    }
    if (modal.kind === "organize" && repo) {
      if (
        await save({
          ...workspace,
          repos: workspace.repos.map((r) =>
            r.path === active
              ? { ...r, group: form.group || r.group, name: value || r.name }
              : r,
          ),
        })
      )
        setModal(null);
      return;
    }
    if (modal.kind === "remove-repo") {
      if (
        await save({
          ...workspace,
          repos: workspace.repos.filter((r) => r.path !== active),
        })
      ) {
        setActive(workspace.repos.find((r) => r.path !== active)?.path ?? "");
        setModal(null);
      }
      return;
    }
    if (modal.kind === "clone") {
      const parent = form.parent?.trim();
      if (!parent || !value || !form.name?.trim()) return;
      if (/[\\/:]/.test(form.name) || [".", ".."].includes(form.name.trim())) {
        setError("Choose a folder name without path separators.");
        return;
      }
      const destination = parent.replace(/[\\/]$/, "") + "/" + form.name.trim();
      if (await run("clone", [value, destination], parent))
        await addRepo(destination, form.group || workspace.groups[0]);
      return;
    }
    if (modal.kind === "worktree") {
      if (
        await run("worktree-add", [
          value,
          form.branch || "",
          form.mode || "new",
        ])
      )
        setModal(null);
      return;
    }
    const actions: Record<string, [string, string[]]> = {
      branch: ["branch", [value]],
      merge: ["merge", [value]],
      rebase: ["rebase", [value]],
      "branch-delete": ["branch-delete", [value]],
      stash: ["stash", [value || "WIP from Orbital"]],
      tag: ["tag", [value]],
      checkout: ["checkout", [value || modal.value || ""]],
      "worktree-remove": ["worktree-remove", [modal.value ?? ""]],
      revert: ["revert", [modal.value ?? ""]],
      "cherry-pick": ["cherry-pick", [modal.value ?? ""]],
      "stash-drop": ["stash-drop", [modal.value ?? ""]],
    };
    if (actions[modal.kind] && (await run(...actions[modal.kind])))
      setModal(null);
  };
  const actions = [
    { label: "Open repository", icon: FolderPlus, fn: () => void pick() },
    {
      label: "Clone repository",
      icon: Github,
      fn: () => showModal("clone", "Clone a repository"),
    },
    {
      label: "Initialize repository",
      icon: FolderGit2,
      fn: () => showModal("init", "Initialize a repository"),
    },
    {
      label: "Add remote",
      icon: Github,
      fn: () => showModal("remote", "Add a remote"),
    },
    {
      label: "Rebase current branch",
      icon: GitBranch,
      fn: () => showModal("rebase", "Rebase current branch"),
    },
    {
      label: "Delete merged branch",
      icon: Trash2,
      fn: () => showModal("branch-delete", "Delete a merged branch"),
    },
    {
      label: "Fetch all remotes",
      icon: RefreshCw,
      fn: () => void run("fetch"),
    },
    {
      label: "Pull current branch",
      icon: ArrowDown,
      fn: () => void run("pull"),
    },
    { label: "Push current branch", icon: ArrowUp, fn: () => void run("push") },
    {
      label: "Create branch",
      icon: GitBranch,
      fn: () => showModal("branch", "Create a branch"),
    },
    {
      label: "Merge into current branch",
      icon: GitMerge,
      fn: () => showModal("merge", "Merge into current branch"),
    },
    {
      label: "Create worktree",
      icon: Layers,
      fn: () => showModal("worktree", "Create a worktree"),
    },
    {
      label: "Open in VS Code",
      icon: Code2,
      fn: () => void run("open-editor"),
    },
    {
      label: "Stash changes",
      icon: Blocks,
      fn: () => showModal("stash", "Stash your changes"),
    },
  ];

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <div className="orbital-logo">
            <GitFork size={19} />
          </div>
          <strong>orbital</strong>
          <span className="brand-divider" />
          <span className="title-caption">A little more perspective.</span>
        </div>
        <button className="quick-search" onClick={() => setPalette(true)}>
          <Search size={14} />
          <span>Jump to a repository or action…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="title-right">
          <span className="version">v{packageInfo.version}</span>
          <span className="avatar">Y</span>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <span>EXPLORER</span>
          <div>
            <IconButton
              title="Create repository group"
              onClick={() => showModal("group", "Create a repository group")}
            >
              <FolderPlus size={15} />
            </IconButton>
            <IconButton title="Open repository" onClick={() => void pick()}>
              <Plus size={17} />
            </IconButton>
          </div>
        </div>
        <div className="repo-search">
          <Search size={14} />
          <input
            placeholder="Find a repository…"
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <div className="repository-groups">
          {workspace.groups.map((group) => (
            <section className="repo-group" key={group}>
              <button
                className="group-label"
                onClick={() =>
                  setCollapsed((c) =>
                    c.includes(group)
                      ? c.filter((x) => x !== group)
                      : [...c, group],
                  )
                }
              >
                {collapsed.includes(group) ? (
                  <ChevronRight size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
                <Folder size={13} />
                <span>{group}</span>
                <span className="count">
                  {workspace.repos.filter((r) => r.group === group).length}
                </span>
              </button>
              {!collapsed.includes(group) &&
                workspace.repos
                  .filter(
                    (r) =>
                      r.group === group &&
                      r.name.toLowerCase().includes(repoQuery.toLowerCase()),
                  )
                  .map((r) => {
                    const s = snapshots[r.path];
                    return (
                      <button
                        key={r.path}
                        className={`repo-item ${active === r.path ? "active" : ""}`}
                        onClick={() => setActive(r.path)}
                      >
                        <div className="repo-icon">
                          <FolderGit2 size={19} />
                        </div>
                        <div className="repo-info">
                          <strong>{r.name}</strong>
                          <span>
                            <GitBranch size={11} />
                            {s?.branch ?? "Loading…"}
                            {s && s.ahead > 0 && (
                              <i className="ahead">↑{s.ahead}</i>
                            )}
                            {s && s.behind > 0 && <i>↓{s.behind}</i>}
                          </span>
                        </div>
                        {s && s.files.length > 0 ? (
                          <span className="dirty-count">{s.files.length}</span>
                        ) : (
                          <span className="clean-dot" />
                        )}
                      </button>
                    );
                  })}
            </section>
          ))}
        </div>
        <button
          className="add-repository"
          onClick={() => showModal("add", "Add a repository")}
        >
          <Plus size={16} />
          Add repository<kbd>＋</kbd>
        </button>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <div className="workspace-icon">
              <Layers size={18} />
            </div>
            <div>
              <strong>Your workspace</strong>
              <span>{workspace.repos.length} repositories · Local</span>
            </div>
            <ShieldCheck size={15} />
          </div>
          <button
            onClick={() => showModal("settings", "Preferences & shortcuts")}
          >
            <Settings2 size={16} />
            Preferences<span>⌘</span>
          </button>
          <div className="local-first">
            <span className="clean-dot" />
            Local first. Yours, always.
          </div>
        </div>
      </aside>
      <main className="main">
        {error && !active && (
          <div className="error-banner" role="alert">
            <Bell size={15} />
            <span>{error}</span>
            <IconButton title="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        {!active ? (
          <div className="welcome">
            <div className="welcome-orbit">
              <GitFork size={42} />
            </div>
            <div className="eyebrow">YOUR NEXT COMMIT STARTS HERE</div>
            <h1>Git, in perspective.</h1>
            <p>
              A clear view of your code, branches, and everything in between.
              <br />
              Open a repository to make yourself at home.
            </p>
            <button className="primary" onClick={() => void pick()}>
              <FolderPlus size={17} />
              Open a repository
            </button>
            <button
              className="text-button"
              onClick={() => showModal("clone", "Clone a repository")}
            >
              <Github size={16} />
              Clone from a remote
            </button>
          </div>
        ) : (
          <>
            <div className="repo-toolbar">
              <div className="repo-breadcrumb">
                <FolderGit2 size={20} />
                <strong>{repo?.name ?? basename(active)}</strong>
                <span>/</span>
                <button onClick={() => showModal("checkout", "Switch branch")}>
                  <GitBranch size={14} />
                  {data?.branch ?? "…"}
                  <ChevronDown size={13} />
                </button>
                <span className="private-label">LOCAL</span>
              </div>
              <div className="toolbar-actions">
                <button
                  disabled={!!busy}
                  onClick={() => void run("fetch")}
                  title="Fetch all remotes"
                >
                  <RefreshCw
                    size={15}
                    className={busy === "fetch" ? "spin" : ""}
                  />
                  Fetch
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => void run("pull")}
                  title="Fast-forward pull; never silently rewrites history"
                >
                  <ArrowDown size={15} />
                  Pull
                  {data && data.behind > 0 && (
                    <span className="button-count">{data.behind}</span>
                  )}
                </button>
                <button
                  className="push-button"
                  disabled={!!busy}
                  onClick={() => void run("push")}
                >
                  <ArrowUp size={15} />
                  Push
                  {data && data.ahead > 0 && (
                    <span className="button-count">{data.ahead}</span>
                  )}
                </button>
                <span className="toolbar-separator" />
                <IconButton
                  title="Open repository in VS Code"
                  onClick={() => void run("open-editor")}
                  disabled={!!busy}
                >
                  <Code2 size={18} />
                </IconButton>
                <IconButton
                  title="Repository settings"
                  onClick={() => showModal("organize", "Organize repository")}
                >
                  <MoreHorizontal size={20} />
                </IconButton>
              </div>
            </div>
            {!desktop && (
              <div className="demo-banner">
                <Sparkles size={13} />
                <span>
                  Explore the workspace demo. Launch the desktop app to connect
                  your local repositories.
                </span>
                <span className="demo-badge">DEMO</span>
              </div>
            )}
            {error && (
              <div className="error-banner">
                <Bell size={15} />
                <span>{error}</span>
                <IconButton title="Dismiss error" onClick={() => setError("")}>
                  <X size={14} />
                </IconButton>
              </div>
            )}
            {data?.operation && (
              <div className="operation-banner">
                <GitMerge size={16} />
                <span>
                  {data.operation} in progress. Resolve conflicting files, stage
                  them, then continue.
                </span>
                <button
                  disabled={!!busy}
                  onClick={() => void run("continue", [data.operation])}
                >
                  Continue
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => void run("abort", [data.operation])}
                >
                  Abort {data.operation}
                </button>
              </div>
            )}
            <div className="view-heading">
              <div>
                <div className="eyebrow">REPOSITORY OVERVIEW</div>
                <h1>
                  {tab === "graph"
                    ? "Commit graph"
                    : tab === "changes"
                      ? "Working changes"
                      : tab === "worktrees"
                        ? "Worktrees"
                        : "Stashes"}
                  <span className="heading-dot" />
                </h1>
                <p>
                  {tab === "graph"
                    ? "Every branch. Every connection. The whole picture."
                    : tab === "changes"
                      ? "Shape your next commit, one change at a time."
                      : tab === "worktrees"
                        ? "Parallel branches. Separate folders. One repository."
                        : "Set work aside and pick it up when you’re ready."}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  onClick={() =>
                    showModal("merge", "Merge into current branch")
                  }
                  disabled={!data || !!busy}
                >
                  <GitMerge size={15} />
                  Merge branch
                </button>
                <button
                  className="primary"
                  disabled={!data || !!busy}
                  onClick={() => showModal("branch", "Create a branch")}
                >
                  <Plus size={15} />
                  New branch
                </button>
              </div>
            </div>
            <nav className="view-tabs">
              {(
                [
                  { id: "graph", label: "Graph", icon: GitFork },
                  {
                    id: "changes",
                    label: "Changes",
                    icon: FileCode2,
                    count: data?.files.length,
                  },
                  {
                    id: "worktrees",
                    label: "Worktrees",
                    icon: Layers,
                    count: data?.worktrees.length,
                  },
                  {
                    id: "stashes",
                    label: "Stashes",
                    icon: Blocks,
                    count: data?.stashes.length,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  aria-label={`${t.label}${"count" in t ? ` ${t.count ?? 0}` : ""}`}
                  className={tab === t.id ? "selected" : ""}
                  onClick={() => {
                    setTab(t.id);
                    setFile("");
                    setPatch("");
                  }}
                >
                  <t.icon size={15} />
                  {t.label}
                  {"count" in t && <span>{t.count ?? 0}</span>}
                </button>
              ))}
              <div className="tabs-spacer" />
              <span className="synced">
                <span className="clean-dot" />
                {busy ? (
                  <>
                    <LoaderCircle size={12} className="spin" />
                    {busy}…
                  </>
                ) : data ? (
                  `${data.ahead} ahead · ${data.behind} behind`
                ) : (
                  "Loading repository…"
                )}
              </span>
            </nav>
            {!data ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                <h3>
                  {error
                    ? "Repository unavailable"
                    : "Reading your repository…"}
                </h3>
                {error && (
                  <button
                    onClick={() =>
                      void refresh(active).catch((e) => setError(String(e)))
                    }
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`content-area ${tab === "graph" ? "with-inspector" : ""}`}
              >
                <section className="primary-panel">
                  {tab === "graph" && (
                    <>
                      <div className="graph-controls">
                        <div className="graph-search">
                          <Search size={14} />
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search commits, authors, or SHA…"
                          />
                          {query && (
                            <button
                              onClick={() => setQuery("")}
                              aria-label="Clear search"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <div className="filter-select">
                          <GitBranch size={13} />
                          <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                          >
                            <option value="all">All branches</option>
                            {data.branches.map((b) => (
                              <option key={b.name}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        <IconButton
                          title="Refresh history"
                          onClick={() =>
                            void refresh(active).catch((e) =>
                              setError(String(e)),
                            )
                          }
                        >
                          <RefreshCw size={14} />
                        </IconButton>
                      </div>
                      <button
                        className="working-row"
                        onClick={() => setTab("changes")}
                      >
                        <span className="working-node">
                          <Circle size={12} />
                        </span>
                        <span>
                          <strong>Working directory</strong>
                          <span className="muted">
                            {data.files.length
                              ? `${data.files.length} uncommitted changes`
                              : "All changes committed"}
                          </span>
                        </span>
                        <span className="working-badge">
                          {data.files.length ? "Review changes" : "Clean"}
                          <ArrowUpRight size={12} />
                        </span>
                      </button>
                      <div className="history-header">
                        <span style={{ width: graph.width }}>GRAPH</span>
                        <span>COMMIT MESSAGE</span>
                        <span>AUTHOR</span>
                        <span>COMMIT</span>
                      </div>
                      <div className="history-scroll">
                        <div
                          className="history-list"
                          style={{ minHeight: commits.length * 46 }}
                        >
                          <svg
                            className="commit-graph"
                            width={graph.width}
                            height={commits.length * 46}
                            aria-label="Commit ancestry graph"
                          >
                            {graph.edges.map((e, i) => (
                              <path
                                key={i}
                                d={e.d}
                                stroke={e.color}
                                strokeWidth="2"
                                fill="none"
                                opacity=".7"
                              />
                            ))}
                            {graph.nodes.map((n) => (
                              <g key={n.hash}>
                                {n.row === 0 && (
                                  <circle
                                    cx={22 + n.lane * 22}
                                    cy={23 + n.row * 46}
                                    r="9"
                                    fill={n.color}
                                    opacity=".13"
                                  />
                                )}
                                <circle
                                  cx={22 + n.lane * 22}
                                  cy={23 + n.row * 46}
                                  r={commits[n.row].parents.length > 1 ? 5 : 4}
                                  fill={
                                    commits[n.row].parents.length > 1
                                      ? "#191b22"
                                      : n.color
                                  }
                                  stroke={n.color}
                                  strokeWidth="2"
                                />
                              </g>
                            ))}
                          </svg>
                          {commits.map((c) => (
                            <button
                              key={c.hash}
                              className={`commit-row ${selected?.hash === c.hash ? "chosen" : ""}`}
                              onClick={() => void chooseCommit(c)}
                            >
                              <span style={{ width: graph.width }} />
                              <span className="commit-subject">
                                <span className="ref-labels">
                                  {c.refs.map((r) => (
                                    <span
                                      key={r}
                                      className={`ref-label ${r.startsWith("HEAD") ? "head" : r.startsWith("tag:") ? "tag" : r.startsWith("origin/") ? "remote" : ""}`}
                                    >
                                      {r.startsWith("tag:") ? (
                                        <Tag size={10} />
                                      ) : (
                                        <GitBranch size={10} />
                                      )}{" "}
                                      {r
                                        .replace("HEAD -> ", "")
                                        .replace("tag: ", "")}
                                      {r.startsWith("HEAD") && (
                                        <span className="head-dot" />
                                      )}
                                    </span>
                                  ))}
                                </span>
                                <span className="subject-text">
                                  {c.subject}
                                </span>
                              </span>
                              <span className="commit-author">
                                <span
                                  className={`tiny-avatar color-${c.author.length % 4}`}
                                >
                                  {c.author[0]}
                                </span>
                                <span>{c.author}</span>
                              </span>
                              <span className="commit-hash">
                                {short(c.hash)}
                                <small>{relative(c.date)}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                        {commits.length === 0 && (
                          <div className="empty-state">
                            <Search size={24} />
                            <h3>
                              {query ? "No matching commits" : "A fresh start"}
                            </h3>
                            <p>
                              {query
                                ? "Try another author, message, or commit hash."
                                : "Your first commit will appear here."}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="history-footer">
                        <span>
                          {commits.length} commits
                          {data.commits.length === 500 ? " · latest 500" : ""}
                        </span>
                        <span>
                          <GitFork size={12} />
                          {data.branches.length} branches
                          <span className="footer-dot">·</span>
                          <Tag size={11} />
                          {data.tags.length} tags
                        </span>
                      </div>
                    </>
                  )}
                  {tab === "changes" && (
                    <div className="changes-layout">
                      <div className="files-panel">
                        <div className="panel-title">
                          <strong>
                            Changed files <span>{data.files.length}</span>
                          </strong>
                          <button
                            disabled={!!busy || !data.files.length}
                            onClick={() => void run("stage-all")}
                          >
                            <CheckCheck size={14} />
                            Stage all
                          </button>
                        </div>
                        {data.files.length === 0 && (
                          <div className="empty-state compact">
                            <CheckCheck size={26} />
                            <h3>Working tree clean</h3>
                            <p>Everything is committed.</p>
                          </div>
                        )}
                        {[
                          {
                            label: "Unstaged changes",
                            files: data.files.filter((f) => f.worktree !== " "),
                            cached: false,
                          },
                          {
                            label: "Staged changes",
                            files: data.files.filter(staged),
                            cached: true,
                          },
                        ].map((section) => (
                          <div key={section.label}>
                            <div className="file-section-label">
                              {section.label}
                              <span>{section.files.length}</span>
                            </div>
                            {section.files.map((f) => (
                              <div
                                className={`file-row ${file === f.path && fileStaged === section.cached ? "active" : ""}`}
                                key={f.path}
                              >
                                <button
                                  onClick={() =>
                                    void showFile(f.path, section.cached)
                                  }
                                >
                                  <span
                                    className={
                                      f.conflict ? "status conflict" : "status"
                                    }
                                  >
                                    {f.conflict
                                      ? "!"
                                      : section.cached
                                        ? f.index
                                        : f.worktree === "?"
                                          ? "U"
                                          : f.worktree}
                                  </span>
                                  <span title={f.path}>{f.path}</span>
                                </button>
                                <IconButton
                                  title={
                                    section.cached
                                      ? "Unstage file"
                                      : "Stage file"
                                  }
                                  disabled={!!busy}
                                  onClick={() =>
                                    void run(
                                      section.cached ? "unstage" : "stage",
                                      [f.path],
                                    )
                                  }
                                >
                                  {section.cached ? (
                                    <X size={14} />
                                  ) : (
                                    <Plus size={14} />
                                  )}
                                </IconButton>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div className="commit-form">
                          <label htmlFor="commit-message">COMMIT MESSAGE</label>
                          <textarea
                            id="commit-message"
                            placeholder="What changed, and why?"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                          />
                          <button
                            className="primary"
                            disabled={
                              !!busy ||
                              !message.trim() ||
                              !data.files.some(staged) ||
                              data.files.some((f) => f.conflict)
                            }
                            onClick={async () => {
                              if (await run("commit", [message])) {
                                setMessage("");
                                setFile("");
                                setPatch("");
                              }
                            }}
                          >
                            <GitCommitHorizontal size={17} />
                            Commit to {data.branch}
                          </button>
                          <button
                            className="text-button"
                            disabled={!!busy || !data.files.length}
                            onClick={() =>
                              showModal("stash", "Stash your changes")
                            }
                          >
                            <Blocks size={14} />
                            Stash changes
                          </button>
                        </div>
                      </div>
                      <DiffViewer
                        file={file}
                        patch={patch}
                        onOpen={() =>
                          void run("open-diff", [
                            file,
                            "",
                            fileStaged ? "staged" : "",
                          ])
                        }
                        disabled={!!busy}
                      />
                    </div>
                  )}
                  {tab === "worktrees" && (
                    <div className="cards-view">
                      <div className="cards-heading">
                        <div>
                          <h2>Room to work in parallel</h2>
                          <p>
                            Keep your current work intact while you switch
                            context.
                          </p>
                        </div>
                        <button
                          className="primary"
                          onClick={() =>
                            showModal("worktree", "Create a worktree")
                          }
                          disabled={!!busy}
                        >
                          <Plus size={15} />
                          New worktree
                        </button>
                      </div>
                      {data.worktrees.map((w) => (
                        <div className="worktree-card" key={w.path}>
                          <div className="worktree-icon">
                            <Layers size={22} />
                          </div>
                          <div className="worktree-details">
                            <h3>
                              {w.branch || "Detached HEAD"}
                              {w.path.replace(/\\/g, "/") ===
                                active.replace(/\\/g, "/") && (
                                <span className="pill">Current</span>
                              )}
                            </h3>
                            <p>{w.path}</p>
                            <span>
                              <GitCommitHorizontal size={12} />
                              {short(w.head)}
                            </span>
                          </div>
                          <button
                            onClick={() => void addRepo(w.path, repo?.group)}
                          >
                            <ArrowUpRight size={14} />
                            Open
                          </button>
                          <IconButton
                            title="Open worktree in VS Code"
                            disabled={!!busy}
                            onClick={() => void run("open-editor", [], w.path)}
                          >
                            <Code2 size={16} />
                          </IconButton>
                          {w.path !== data.worktrees[0]?.path && (
                            <IconButton
                              title="Remove worktree"
                              disabled={!!busy}
                              onClick={() =>
                                showModal(
                                  "worktree-remove",
                                  "Remove worktree?",
                                  w.path,
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          )}
                        </div>
                      ))}
                      <div className="info-card">
                        <Sparkles size={19} />
                        <div>
                          <strong>A branch in its own space.</strong>
                          <p>
                            Worktrees share history and remotes, with
                            independent working files. Perfect for a quick fix
                            while a feature is in progress.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {tab === "stashes" && (
                    <div className="cards-view">
                      <div className="cards-heading">
                        <div>
                          <h2>A place for work in progress</h2>
                          <p>Your unfinished ideas, ready when you are.</p>
                        </div>
                        <button
                          className="primary"
                          onClick={() =>
                            showModal("stash", "Stash your changes")
                          }
                          disabled={!!busy || !data.files.length}
                        >
                          <Plus size={15} />
                          Stash changes
                        </button>
                      </div>
                      {data.stashes.length === 0 && (
                        <div className="empty-state">
                          <Blocks size={32} />
                          <h3>Nothing set aside</h3>
                          <p>
                            Stash changes to save your work without making a
                            commit.
                          </p>
                        </div>
                      )}
                      {data.stashes.map((s) => (
                        <div className="stash-card" key={s}>
                          <Blocks size={21} />
                          <div>
                            <h3>{s.split(": ").slice(1).join(": ")}</h3>
                            <code>{s.split(":")[0]}</code>
                          </div>
                          <button
                            disabled={!!busy}
                            onClick={() =>
                              void run("stash-apply", [s.split(":")[0]])
                            }
                          >
                            <ArrowDownToLine size={14} />
                            Apply
                          </button>
                          <IconButton
                            title="Delete stash"
                            disabled={!!busy}
                            onClick={() =>
                              showModal(
                                "stash-drop",
                                "Delete this stash?",
                                s.split(":")[0],
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                {tab === "graph" && (
                  <aside className="inspector">
                    {selected ? (
                      <>
                        <div className="inspector-title">
                          <span>COMMIT DETAILS</span>
                          <IconButton
                            title="Close commit details"
                            onClick={() => {
                              setSelected(null);
                              setFile("");
                            }}
                          >
                            <X size={14} />
                          </IconButton>
                        </div>
                        <div className="commit-detail">
                          <div className="detail-icon">
                            <GitCommitHorizontal size={24} />
                          </div>
                          <h2>{selected.subject}</h2>
                          <div className="detail-author">
                            <span className="tiny-avatar">
                              {selected.author[0]}
                            </span>
                            <strong>{selected.author}</strong>
                            <span>{relative(selected.date)}</span>
                          </div>
                          <button
                            className="sha-copy"
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(selected.hash)
                                .then(() => setToast("Commit SHA copied"))
                                .catch((e) => setError(String(e)))
                            }
                          >
                            <code>{short(selected.hash)}</code>
                            <Copy size={12} />
                          </button>
                          <p className="detail-date">
                            {new Date(selected.date).toLocaleString()}
                          </p>
                          <div className="detail-actions">
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                showModal(
                                  "cherry-pick",
                                  "Cherry-pick this commit?",
                                  selected.hash,
                                )
                              }
                            >
                              <GitCommitHorizontal size={13} />
                              Cherry-pick
                            </button>
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                showModal(
                                  "revert",
                                  "Revert this commit?",
                                  selected.hash,
                                )
                              }
                            >
                              <ArrowLeftRight size={13} />
                              Revert
                            </button>
                          </div>
                        </div>
                        <div className="inspector-section">
                          <h3>
                            CHANGED FILES <span>{commitFiles.length}</span>
                          </h3>
                          {commitFiles.map((f) => (
                            <button
                              className="commit-file"
                              key={f}
                              onClick={() =>
                                void showFile(f, false, selected.hash)
                              }
                            >
                              <FileCode2 size={13} />
                              <span title={f}>{basename(f)}</span>
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                        {file && (
                          <div className="inspector-diff">
                            <DiffViewer
                              file={file}
                              patch={patch}
                              onOpen={() =>
                                void run("open-diff", [file, selected.hash])
                              }
                              disabled={!!busy}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="inspector-title">
                          <span>BRANCHES & MORE</span>
                          <IconButton
                            title="Create branch"
                            onClick={() =>
                              showModal("branch", "Create a branch")
                            }
                          >
                            <Plus size={15} />
                          </IconButton>
                        </div>
                        <div className="inspector-section">
                          <h3>
                            <GitBranch size={13} />
                            LOCAL BRANCHES<span>{localBranches.length}</span>
                          </h3>
                          {localBranches.map((b) => (
                            <button
                              className={`branch-row ${b.current ? "current" : ""}`}
                              key={b.name}
                              onClick={() =>
                                b.current
                                  ? setBranchFilter("all")
                                  : showModal(
                                      "checkout",
                                      "Switch branch",
                                      b.name,
                                    )
                              }
                            >
                              <GitBranch size={14} />
                              <span>{b.name}</span>
                              {b.current ? (
                                <Check size={13} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="inspector-section">
                          <h3>
                            <Github size={13} />
                            REMOTES<span>{data.remotes.length ? 1 : 0}</span>
                          </h3>
                          {data.branches
                            .filter(
                              (b) => b.remote ?? b.name.startsWith("origin/"),
                            )
                            .map((b) => (
                              <button
                                className="branch-row"
                                key={b.name}
                                onClick={() => setBranchFilter(b.name)}
                              >
                                <GitBranch size={13} />
                                <span>{b.name}</span>
                                <span className="remote-dot" />
                              </button>
                            ))}
                          {!data.remotes.length && (
                            <p className="muted small">No remotes configured</p>
                          )}
                        </div>
                        <div className="inspector-section">
                          <h3>
                            <Tag size={13} />
                            TAGS<span>{data.tags.length}</span>
                            <IconButton
                              title="Create tag on HEAD"
                              onClick={() => showModal("tag", "Create a tag")}
                            >
                              <Plus size={12} />
                            </IconButton>
                          </h3>
                          {data.tags.slice(-10).map((t) => (
                            <button
                              className="branch-row"
                              key={t}
                              onClick={() => setQuery(t)}
                            >
                              <Tag size={13} />
                              <span>{t}</span>
                            </button>
                          ))}
                        </div>
                        <div className="sidebar-tip">
                          <div className="tip-icon">
                            <Command size={18} />
                          </div>
                          <strong>Stay in your flow</strong>
                          <p>
                            Find a repo, switch a branch, or run an action. All
                            from your keyboard.
                          </p>
                          <button onClick={() => setPalette(true)}>
                            Open command palette<kbd>Ctrl K</kbd>
                          </button>
                        </div>
                        <div className="inspector-bottom">
                          <Activity size={14} />
                          <span>Built for your next great commit.</span>
                        </div>
                      </>
                    )}
                  </aside>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="statusbar">
        <span>
          <span className="clean-dot" />
          {desktop ? "Local workspace" : "Demo workspace"}
          <span className="status-divider" />
          {data ? (
            <>
              <GitBranch size={12} />
              {data.branch}
            </>
          ) : (
            "No repository selected"
          )}
        </span>
        <span>
          {busy ? (
            <>
              <LoaderCircle size={12} className="spin" />
              Running {busy}…
            </>
          ) : (
            <>
              <Check size={12} />
              Ready
            </>
          )}
          <span className="status-divider" />
          <button onClick={() => setPalette(true)}>
            Command palette <kbd>Ctrl K</kbd>
          </button>
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast.length > 180 ? toast.slice(0, 180) + "…" : toast}</span>
          <IconButton title="Dismiss notification" onClick={() => setToast("")}>
            <X size={13} />
          </IconButton>
        </div>
      )}
      {palette && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPalette(false);
          }}
        >
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="palette-search">
              <Search size={19} />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Where would you like to go?"
              />
              <kbd onClick={() => setPalette(false)}>esc</kbd>
            </div>
            <div className="palette-results">
              <div className="eyebrow">ACTIONS</div>
              {actions
                .filter((a) =>
                  a.label.toLowerCase().includes(paletteQuery.toLowerCase()),
                )
                .map((a) => (
                  <button
                    disabled={!!busy}
                    key={a.label}
                    onClick={() => {
                      setPalette(false);
                      a.fn();
                    }}
                  >
                    <a.icon size={17} />
                    {a.label}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              <div className="eyebrow">REPOSITORIES</div>
              {workspace.repos
                .filter((r) =>
                  r.name.toLowerCase().includes(paletteQuery.toLowerCase()),
                )
                .map((r) => (
                  <button
                    key={r.path}
                    onClick={() => {
                      setActive(r.path);
                      setPalette(false);
                    }}
                  >
                    <FolderGit2 size={17} />
                    {r.name}
                    <span>{r.group}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onSubmit={(e) => {
              e.preventDefault();
              void submitModal();
            }}
          >
            <div className="modal-heading">
              <div className="modal-symbol">
                {modal.kind === "worktree" ? (
                  <Layers size={21} />
                ) : modal.kind === "merge" ? (
                  <GitMerge size={21} />
                ) : (
                  <GitBranch size={21} />
                )}
              </div>
              <IconButton
                title="Close dialog"
                disabled={!!busy}
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </IconButton>
            </div>
            <h2 id="modal-title">{modal.title}</h2>
            {modal.kind === "settings" ? (
              <div className="settings-content">
                <p>
                  Orbital uses your installed Git, SSH keys, credential manager,
                  and Git identity. Credentials stay with Git.
                </p>
                <div>
                  <span>Open command palette</span>
                  <kbd>Ctrl K</kbd>
                </div>
                <div>
                  <span>Refresh repository</span>
                  <kbd>Ctrl R</kbd>
                </div>
                <div>
                  <span>Close dialog</span>
                  <kbd>Esc</kbd>
                </div>
                <p>
                  Repositories refresh every 15 seconds. Pull uses fast-forward
                  only. Workspace groups are saved in your application config
                  directory.
                </p>
                <p>
                  VS Code diffs compare snapshots of the selected staged,
                  unstaged, or committed file. Temporary diff files live in your
                  system temp directory under orbital-diffs.
                </p>
                <p className="muted">
                  Version {packageInfo.version} · Tauri + Rust · Local first
                </p>
              </div>
            ) : (
              <>
                {modal.kind === "merge" && (
                  <p className="modal-description">
                    Bring another branch into <strong>{data?.branch}</strong>.
                    Git preserves both histories. If there are conflicts,
                    resolve and stage the files in Changes.
                  </p>
                )}
                {modal.kind === "worktree" && (
                  <p className="modal-description">
                    Create a separate working directory without leaving your
                    current branch.
                  </p>
                )}
                {modal.kind === "rebase" && (
                  <p className="modal-description">
                    Replay your current branch’s commits on the selected branch.
                    This changes local commit IDs. Rebase unpublished work; use
                    Merge for shared branches.
                  </p>
                )}
                {modal.kind === "branch-delete" && (
                  <p className="modal-description">
                    Remove a local branch that has already been merged. Git
                    refuses to remove unmerged branches or branches used by a
                    worktree.
                  </p>
                )}
                {modal.kind === "merge" && comparison && (
                  <p className="merge-preview">
                    <GitMerge size={14} />
                    {comparison}
                  </p>
                )}
                {[
                  "worktree-remove",
                  "stash-drop",
                  "remove-repo",
                  "revert",
                  "cherry-pick",
                ].includes(modal.kind) ? (
                  <div className="confirm-copy">
                    <p>
                      {modal.kind === "worktree-remove"
                        ? "This removes the worktree directory. Git will refuse if it contains uncommitted work."
                        : modal.kind === "stash-drop"
                          ? "This permanently removes the saved stash. Apply it first if you need those changes."
                          : modal.kind === "remove-repo"
                            ? "Remove this repository from your workspace. Files on disk are kept."
                            : modal.kind === "revert"
                              ? "Create a new commit that reverses this commit. Your existing history is preserved."
                              : "Apply this commit’s changes to your current branch."}
                    </p>
                    <code>{modal.value ?? active}</code>
                  </div>
                ) : modal.kind === "checkout" ? (
                  <>
                    <p className="modal-description">
                      Git checks for local changes before switching branches.
                    </p>
                    <label>
                      Branch
                      <select
                        required
                        value={form.value ?? modal.value ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, value: e.target.value })
                        }
                      >
                        <option value="">Choose a branch</option>
                        {data?.branches
                          .filter((b) => !b.current)
                          .map((b) => (
                            <option key={b.name}>{b.name}</option>
                          ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    {modal.kind === "worktree" && (
                      <label>
                        Branch mode
                        <select
                          value={form.mode ?? "new"}
                          onChange={(e) =>
                            setForm({ ...form, mode: e.target.value })
                          }
                        >
                          <option value="new">
                            Create a new branch from current HEAD
                          </option>
                          <option value="existing">
                            Use an existing branch
                          </option>
                        </select>
                      </label>
                    )}
                    <label>
                      {modal.kind === "group"
                        ? "Group name"
                        : modal.kind === "branch"
                          ? "New branch name"
                          : ["merge", "rebase", "branch-delete"].includes(
                                modal.kind,
                              )
                            ? modal.kind === "merge"
                              ? "Branch to merge"
                              : modal.kind === "rebase"
                                ? "Rebase onto"
                                : "Branch to delete"
                            : modal.kind === "tag"
                              ? "Tag name"
                              : modal.kind === "stash"
                                ? "Stash description"
                                : modal.kind === "worktree"
                                  ? "Worktree folder path"
                                  : ["clone", "remote"].includes(modal.kind)
                                    ? "Remote URL"
                                    : modal.kind === "organize"
                                      ? "Display name"
                                      : "Repository folder path"}
                      {["merge", "rebase", "branch-delete"].includes(
                        modal.kind,
                      ) ? (
                        <select
                          autoFocus
                          required
                          value={form.value ?? ""}
                          onChange={(e) =>
                            setForm({ ...form, value: e.target.value })
                          }
                        >
                          <option value="">Choose a branch…</option>
                          {data?.branches
                            .filter(
                              (b) =>
                                !b.current &&
                                (modal.kind !== "branch-delete" ||
                                  !(b.remote ?? b.name.startsWith("origin/"))),
                            )
                            .map((b) => (
                              <option key={b.name}>{b.name}</option>
                            ))}
                        </select>
                      ) : (
                        <input
                          autoFocus
                          required={modal.kind !== "stash"}
                          value={
                            form.value ??
                            (modal.kind === "organize"
                              ? (repo?.name ?? "")
                              : "")
                          }
                          onChange={(e) =>
                            setForm({ ...form, value: e.target.value })
                          }
                          placeholder={
                            modal.kind === "branch"
                              ? "feature/your-next-idea"
                              : modal.kind === "worktree"
                                ? "D:/projects/my-feature"
                                : modal.kind === "clone"
                                  ? "https://github.com/you/repository.git"
                                  : modal.kind === "stash"
                                    ? "WIP: a little something for later"
                                    : ""
                          }
                        />
                      )}
                    </label>
                    {modal.kind === "add" && (
                      <button
                        type="button"
                        className="browse-button"
                        onClick={() => void pick()}
                      >
                        <Folder size={14} />
                        Browse folders
                      </button>
                    )}
                    {modal.kind === "worktree" && (
                      <label>
                        Branch name
                        {form.mode === "existing" ? (
                          <select
                            required
                            value={form.branch ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, branch: e.target.value })
                            }
                          >
                            <option value="">Select a branch</option>
                            {localBranches
                              .filter(
                                (b) =>
                                  !data?.worktrees.some(
                                    (w) => w.branch === b.name,
                                  ),
                              )
                              .map((b) => (
                                <option key={b.name}>{b.name}</option>
                              ))}
                          </select>
                        ) : (
                          <input
                            required
                            placeholder="feature/parallel-work"
                            value={form.branch ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, branch: e.target.value })
                            }
                          />
                        )}
                      </label>
                    )}
                    {modal.kind === "clone" && (
                      <>
                        <label>
                          Parent directory
                          <input
                            required
                            value={form.parent ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, parent: e.target.value })
                            }
                            placeholder="D:/projects"
                          />
                        </label>
                        <label>
                          New folder name
                          <input
                            required
                            value={form.name ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, name: e.target.value })
                            }
                          />
                        </label>
                      </>
                    )}
                    {modal.kind === "remote" && (
                      <label>
                        Remote name
                        <input
                          required
                          value={form.name ?? "origin"}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                        />
                      </label>
                    )}
                    {["add", "clone", "organize"].includes(modal.kind) && (
                      <label>
                        Repository group
                        <select
                          value={
                            form.group ?? repo?.group ?? workspace.groups[0]
                          }
                          onChange={(e) =>
                            setForm({ ...form, group: e.target.value })
                          }
                        >
                          {workspace.groups.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
                {error && (
                  <div className="modal-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="modal-footer">
                  {modal.kind === "organize" && (
                    <button
                      type="button"
                      className="danger-text"
                      onClick={() =>
                        showModal("remove-repo", "Remove from workspace?")
                      }
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={
                      ["stash-drop", "worktree-remove"].includes(modal.kind)
                        ? "danger"
                        : "primary"
                    }
                    disabled={!!busy}
                    type="submit"
                  >
                    {busy ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <Check size={14} />
                    )}{" "}
                    {modal.kind === "merge"
                      ? `Merge into ${data?.branch}`
                      : modal.kind === "checkout"
                        ? "Switch branch"
                        : modal.kind === "worktree"
                          ? "Create worktree"
                          : modal.kind === "clone"
                            ? "Clone repository"
                            : "Confirm"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

function DiffViewer({
  file,
  patch,
  onOpen,
  disabled,
}: {
  file: string;
  patch: string;
  onOpen: () => void;
  disabled: boolean;
}) {
  return (
    <div className="diff-viewer">
      {file ? (
        <>
          <div className="diff-heading">
            <FileCode2 size={14} />
            <span title={file}>{file}</span>
            <button disabled={disabled} onClick={onOpen}>
              <Code2 size={14} />
              VS Code
              <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="diff-code">
            {patch.split("\n").map((line, i) => (
              <div
                className={`diff-line ${line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : line.startsWith("@@") ? "hunk" : ""}`}
                key={i}
              >
                <span className="line-number">{i + 1}</span>
                <pre>{line || " "}</pre>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <FileCode2 size={30} />
          </div>
          <h3>A closer look at your changes</h3>
          <p>
            Select a file to inspect its diff.
            <br />
            Open it in VS Code when you need more room.
          </p>
        </div>
      )}
    </div>
  );
}

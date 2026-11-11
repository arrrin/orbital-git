import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
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
import ResizeHandle from "./ResizeHandle";
import RepoContextMenu from "./RepoContextMenu";
import { defaults, preferenceKey, readPreferences } from "./preferences";
import { optimisticIndex } from "./index-state";
import Select from "./Select";
import { normalizeWorkspace } from "./workspace";
import { useAppUpdates } from "./useAppUpdates";
import { layoutGraph } from "./graph";
import type {
  Commit,
  FileStatus,
  Repo,
  Snapshot,
  Workspace,
  WorkingState,
} from "./types";

type Tab = "graph" | "changes" | "worktrees" | "stashes";
type Modal = { kind: string; title: string; value?: string };
const short = (s: string) => s.slice(0, 7);
const basename = (s: string) =>
  s.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? s;
const staged = (f: FileStatus) => ![" ", "?"].includes(f.index);
const sameWorkingState = (a: WorkingState | undefined, b: WorkingState) =>
  !!a &&
  a.head === b.head &&
  a.branch === b.branch &&
  a.upstream === b.upstream &&
  a.ahead === b.ahead &&
  a.behind === b.behind &&
  a.operation === b.operation &&
  JSON.stringify(a.files) === JSON.stringify(b.files);
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
  const [tab, setTab] = useState<Tab>("changes");
  const [selected, setSelected] = useState<Commit | null>(null);
  const [query, setQuery] = useState("");
  const [repoQuery, setRepoQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [gitBusy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState(readPreferences);
  const [contextMenu, setContextMenu] = useState<{
    repo: Repo;
    x: number;
    y: number;
  } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, WorkingState>>({});
  const [indexPending, setIndexPending] = useState<Record<string, number>>({});
  const updates = useAppUpdates(
    !gitBusy && !Object.values(indexPending).some(Boolean),
  );
  const busy = gitBusy || (updates.isInstalling ? "app update" : "");
  const updateDisabled =
    !!gitBusy ||
    Object.values(indexPending).some(Boolean) ||
    updates.phase === "checking" ||
    (updates.isInstalling && updates.phase !== "installed");
  const updateLabel =
    updates.phase === "installed"
      ? "Restart to finish"
      : updates.phase === "downloading"
        ? `Downloading ${updates.progress === null ? "…" : updates.progress + "%"}`
        : updates.isInstalling
          ? "Installing…"
          : `Update to ${updates.version}`;
  const applyUpdate = () =>
    void (
      updates.phase === "installed" ? updates.restart() : updates.install()
    ).catch((error) => setError(String(error)));
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const [lastFetched, setLastFetched] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [file, setFile] = useState("");
  const [fileStaged, setFileStaged] = useState(false);
  const [patch, setPatch] = useState("");
  const [diffNonce, setDiffNonce] = useState(0);
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
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;
  const indexQueues = useRef(new Map<string, Promise<boolean>>());
  const statusRequests = useRef(
    new Map<string, { epoch: number; promise: Promise<void> }>(),
  );
  const fullRequests = useRef(
    new Map<string, { epoch: number; promise: Promise<void> }>(),
  );
  const epochs = useRef(new Map<string, number>());
  const fetchInProgress = useRef(new Map<string, Promise<string>>());
  const fetchCycle = useRef(false);
  const modalRepo = workspace.repos.find(
    (r) => r.path === (modal?.value ?? active),
  );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeGroupMenu = useCallback(() => setGroupMenu(null), []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-font",
      preferences.fontFamily,
    );
    document.documentElement.style.setProperty(
      "--ui-font-size",
      `${preferences.fontSize}px`,
    );
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(preferences));
      } catch {
        /* Settings remain usable if storage is unavailable. */
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [preferences]);
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
        setWorkspace(normalizeWorkspace(w));
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
    const existing = fullRequests.current.get(path);
    const epoch = epochs.current.get(path) ?? 0;
    if (existing?.epoch === epoch) return existing.promise;
    const request = (async () => {
      const next = await api.snapshot(path);
      if (
        mounted.current &&
        (epochs.current.get(path) ?? 0) === epoch &&
        !indexQueues.current.has(path)
      ) {
        setSnapshots((s) => ({ ...s, [path]: next }));
        setSummaries((s) => ({ ...s, [path]: next }));
      }
    })();
    fullRequests.current.set(path, { epoch, promise: request });
    try {
      await request;
    } finally {
      if (fullRequests.current.get(path)?.promise === request)
        fullRequests.current.delete(path);
    }
  }, []);
  const refreshWorking = useCallback(
    async (path: string) => {
      if (indexQueues.current.has(path)) return;
      const existing = statusRequests.current.get(path);
      const epoch = epochs.current.get(path) ?? 0;
      if (existing?.epoch === epoch) return existing.promise;
      const request = (async () => {
        const next = await api.workingState(path);
        if (
          !mounted.current ||
          (epochs.current.get(path) ?? 0) !== epoch ||
          indexQueues.current.has(path)
        )
          return;
        setSummaries((s) =>
          sameWorkingState(s[path], next) ? s : { ...s, [path]: next },
        );
        const previous = snapshotsRef.current[path];
        setSnapshots((s) =>
          !s[path] || sameWorkingState(s[path], next)
            ? s
            : { ...s, [path]: { ...s[path], ...next } },
        );
        if (
          previous &&
          previous.head !== next.head &&
          activeRef.current === path
        )
          await refresh(path);
      })();
      statusRequests.current.set(path, { epoch, promise: request });
      try {
        await request;
      } finally {
        if (statusRequests.current.get(path)?.promise === request)
          statusRequests.current.delete(path);
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const update = async () => {
      for (const r of workspace.repos) {
        if (cancelled) return;
        try {
          await refreshWorking(r.path);
        } catch (e) {
          if (!cancelled && r.path === activeRef.current) setError(String(e));
        }
      }
    };
    void update();
    const timer = setInterval(() => {
      if (!lock.current) void update();
    }, 15000);
    const activeTimer = setInterval(() => {
      if (!lock.current && activeRef.current)
        void refreshWorking(activeRef.current).catch((e) =>
          setError(String(e)),
        );
    }, 3000);
    const focus = () => {
      setDiffNonce((n) => n + 1);
      if (!lock.current && activeRef.current)
        void refreshWorking(activeRef.current).catch((e) =>
          setError(String(e)),
        );
    };
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(activeTimer);
      window.removeEventListener("focus", focus);
    };
  }, [workspace.repos, ready, refreshWorking]);
  useEffect(() => {
    setSelected(null);
    setFile("");
    setPatch("");
    setTab("changes");
    setBranchFilter("all");
    setQuery("");
    setError("");
    ++diffGeneration.current;
    if (active)
      void (
        snapshotsRef.current[active] ? refreshWorking(active) : refresh(active)
      ).catch((e) => setError(String(e)));
  }, [active, refresh, refreshWorking]);
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
  const changeIndex = useCallback(
    (action: string, args: string[], path: string): Promise<boolean> => {
      epochs.current.set(path, (epochs.current.get(path) ?? 0) + 1);
      setError("");
      setSnapshots((s) =>
        s[path]
          ? {
              ...s,
              [path]: {
                ...s[path],
                files: optimisticIndex(s[path].files, action, args[0]),
              },
            }
          : s,
      );
      setIndexPending((p) => ({ ...p, [path]: (p[path] ?? 0) + 1 }));
      const previous = indexQueues.current.get(path) ?? Promise.resolve(true);
      const task: Promise<boolean> = previous
        .catch(() => false)
        .then(async () => {
          try {
            await api.execute(path, action, args);
            return true;
          } catch (e) {
            setError(String(e));
            return false;
          }
        });
      indexQueues.current.set(path, task);
      return task.finally(async () => {
        if (indexQueues.current.get(path) === task) {
          indexQueues.current.delete(path);
          try {
            await refreshWorking(path);
          } catch (e) {
            setError(String(e));
          }
        }
        setIndexPending((p) => ({
          ...p,
          [path]: Math.max(0, (p[path] ?? 1) - 1),
        }));
      });
    },
    [refreshWorking],
  );
  const run = useCallback(
    async (action: string, args: string[] = [], path = active) => {
      if (updates.isInstalling) return false;
      if (["stage", "unstage", "stage-all"].includes(action))
        return changeIndex(action, args, path);
      if (lock.current) return false;
      lock.current = true;
      setBusy(action);
      setError("");
      try {
        await indexQueues.current.get(path);
        epochs.current.set(path, (epochs.current.get(path) ?? 0) + 1);
        const result = await ((action === "fetch" &&
          fetchInProgress.current.get(path)) ||
          api.execute(path, action, args));
        if (action === "fetch") {
          setLastFetched((s) => ({ ...s, [path]: new Date().toISOString() }));
          setFetchErrors((s) => ({ ...s, [path]: "" }));
        }
        if (!["clone", "open-editor", "open-diff", "reveal"].includes(action))
          await refresh(path);
        if (!["open-editor", "open-diff", "reveal"].includes(action))
          setToast(
            result ||
              ({
                fetch: "Remotes fetched",
                commit: "Commit created",
                pull: "Branch pulled",
                push: "Branch pushed",
              }[action] ??
                "Git operation completed"),
          );
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
    [active, refresh, changeIndex, updates.isInstalling],
  );
  useEffect(() => {
    if (!ready || !desktop || !preferences.fetchMinutes || updates.isInstalling)
      return;
    let cancelled = false;
    const fetchAll = async () => {
      if (fetchCycle.current) return;
      fetchCycle.current = true;
      try {
        for (const r of workspace.repos) {
          if (cancelled) return;
          if (
            lock.current ||
            indexQueues.current.has(r.path) ||
            fetchInProgress.current.has(r.path)
          )
            continue;
          const operation = api.execute(r.path, "fetch", []);
          fetchInProgress.current.set(r.path, operation);
          try {
            await operation;
            if (cancelled) return;
            setLastFetched((s) => ({
              ...s,
              [r.path]: new Date().toISOString(),
            }));
            setFetchErrors((s) => ({ ...s, [r.path]: "" }));
            if (activeRef.current === r.path) await refresh(r.path);
            else await refreshWorking(r.path);
          } catch (e) {
            if (!cancelled)
              setFetchErrors((s) => ({ ...s, [r.path]: String(e) }));
          } finally {
            fetchInProgress.current.delete(r.path);
          }
        }
      } finally {
        fetchCycle.current = false;
      }
    };
    const timer = setInterval(
      () => void fetchAll(),
      preferences.fetchMinutes * 60000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    ready,
    preferences.fetchMinutes,
    workspace.repos,
    refresh,
    refreshWorking,
    updates.isInstalling,
  ]);
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
    if (!revision) {
      setDiffNonce((n) => n + 1);
      return;
    }
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
  const filesFingerprint = JSON.stringify(data?.files);
  useEffect(() => {
    if (tab !== "changes" || !file || indexPending[active]) return;
    const status = snapshotsRef.current[active]?.files.find(
      (f) => f.path === file,
    );
    if (!status) {
      setFile("");
      setPatch("");
      return;
    }
    const nextStaged =
      staged(status) && (fileStaged || status.worktree === " ");
    if (nextStaged !== fileStaged) {
      setFileStaged(nextStaged);
      return;
    }
    const generation = ++diffGeneration.current;
    api
      .diff(active, file, null, nextStaged)
      .then((result) => {
        if (generation === diffGeneration.current)
          setPatch(
            result || "No text changes. This may be a binary file or a rename.",
          );
      })
      .catch((e) => {
        if (generation === diffGeneration.current) setPatch(String(e));
      });
    return () => {
      ++diffGeneration.current;
    };
  }, [
    active,
    file,
    fileStaged,
    tab,
    filesFingerprint,
    indexPending[active],
    diffNonce,
  ]);
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
  }, [data?.commits, query, branchFilter]);
  const graph = useMemo(() => layoutGraph(commits), [commits]);
  const localBranches =
    data?.branches.filter((b) => !(b.remote ?? b.name.startsWith("origin/"))) ??
    [];
  const submitModal = async () => {
    if (!modal) return;
    const value = form.value?.trim() ?? "";
    if (modal.kind === "group-add" || modal.kind === "group-rename") {
      const name = value || (modal.kind === "group-rename" ? modal.value : "");
      if (!name) return;
      if (workspace.groups.includes(name) && name !== modal.value) {
        setError("A group with this name already exists.");
        return;
      }
      const next =
        modal.kind === "group-add"
          ? { ...workspace, groups: [...workspace.groups, name] }
          : {
              groups: workspace.groups.map((g) =>
                g === modal.value ? name : g,
              ),
              repos: workspace.repos.map((r) =>
                r.group === modal.value ? { ...r, group: name } : r,
              ),
            };
      if (await save(next)) setModal(null);
      return;
    }
    if (modal.kind === "group-remove") {
      const remaining = workspace.groups.filter((g) => g !== modal.value);
      if (!remaining.length) {
        setError("Keep at least one repository group.");
        return;
      }
      if (
        await save({
          groups: remaining,
          repos: workspace.repos.map((r) =>
            r.group === modal.value ? { ...r, group: remaining[0] } : r,
          ),
        })
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
    if (modal.kind === "organize" && modalRepo) {
      if (
        await save({
          ...workspace,
          repos: workspace.repos.map((r) =>
            r.path === modalRepo.path
              ? { ...r, name: value || r.name, group: form.group || r.group }
              : r,
          ),
        })
      )
        setModal(null);
      return;
    }
    if (modal.kind === "remove-repo") {
      const target = modal.value ?? active;
      if (
        await save({
          ...workspace,
          repos: workspace.repos.filter((r) => r.path !== target),
        })
      ) {
        if (active === target)
          setActive(workspace.repos.find((r) => r.path !== target)?.path ?? "");
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
    <div
      className="app-shell"
      data-animations={preferences.animations}
      style={
        {
          "--sidebar-width": `${preferences.sidebarWidth}px`,
          "--files-width": `${preferences.filesWidth}px`,
          "--inspector-width": `${preferences.inspectorWidth}px`,
        } as CSSProperties
      }
    >
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
          {updates.version && (
            <button
              className="update-button"
              disabled={updateDisabled}
              onClick={applyUpdate}
              title={updates.error || "Download and install the signed update"}
            >
              <ArrowDownToLine size={13} />
              {updateLabel}
            </button>
          )}
          <span className="avatar">Y</span>
        </div>
      </header>
      <aside className="sidebar">
        <ResizeHandle
          label="Resize repository sidebar"
          value={preferences.sidebarWidth}
          min={170}
          max={420}
          onChange={(value) =>
            setPreferences((p) => ({ ...p, sidebarWidth: value }))
          }
          onReset={() =>
            setPreferences((p) => ({
              ...p,
              sidebarWidth: defaults.sidebarWidth,
            }))
          }
        />
        <div className="sidebar-heading">
          <span>REPOSITORIES</span>
          <div>
            <IconButton
              title="Create repository group"
              onClick={() => showModal("group-add", "Create repository group")}
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
        <div className="repository-list">
          {workspace.groups.map((group) => (
            <section key={group} className="repo-group">
              <div
                className="group-heading"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setGroupMenu({
                    name: group,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <button
                  className="group-label"
                  onClick={() =>
                    setCollapsedGroups((groups) =>
                      groups.includes(group)
                        ? groups.filter((g) => g !== group)
                        : [...groups, group],
                    )
                  }
                >
                  {collapsedGroups.includes(group) ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <Folder size={12} />
                  <span>{group}</span>
                  <span className="count">
                    {workspace.repos.filter((r) => r.group === group).length}
                  </span>
                </button>
                <button
                  className="icon-button group-options"
                  aria-label={"Options for group " + group}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    setGroupMenu({ name: group, x: box.right, y: box.bottom });
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
              {!collapsedGroups.includes(group) &&
                workspace.repos
                  .filter(
                    (r) =>
                      r.group === group &&
                      r.name.toLowerCase().includes(repoQuery.toLowerCase()),
                  )
                  .map((r) => {
                    const state = snapshots[r.path] ?? summaries[r.path];
                    const menu = (x: number, y: number) =>
                      setContextMenu({ repo: r, x, y });
                    return (
                      <div className="repo-entry" key={r.path}>
                        <button
                          className={
                            "repo-item " + (active === r.path ? "active" : "")
                          }
                          onClick={() => setActive(r.path)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            menu(e.clientX, e.clientY);
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "ContextMenu" ||
                              (e.shiftKey && e.key === "F10")
                            ) {
                              e.preventDefault();
                              const b = e.currentTarget.getBoundingClientRect();
                              menu(b.left + 30, b.top + 20);
                            }
                          }}
                          title={
                            fetchErrors[r.path]
                              ? "Background fetch failed: " +
                                fetchErrors[r.path]
                              : r.path
                          }
                        >
                          <div className="repo-icon">
                            <FolderGit2 size={19} />
                          </div>
                          <div className="repo-info">
                            <strong>{r.name}</strong>
                            <span>
                              <GitBranch size={11} />
                              {state?.branch ?? "Loading…"}
                              {state && state.ahead > 0 && (
                                <i className="ahead">↑{state.ahead}</i>
                              )}
                              {state && state.behind > 0 && (
                                <i>↓{state.behind}</i>
                              )}
                            </span>
                          </div>
                          {fetchErrors[r.path] ? (
                            <Bell size={12} className="fetch-error-icon" />
                          ) : state && state.files.length > 0 ? (
                            <span className="dirty-count">
                              {state.files.length}
                            </span>
                          ) : (
                            <span className="clean-dot" />
                          )}
                        </button>
                        <button
                          className="repo-options icon-button"
                          aria-label={"Options for " + r.name}
                          onClick={(e) => {
                            const b = e.currentTarget.getBoundingClientRect();
                            menu(b.right, b.bottom);
                          }}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    );
                  })}
            </section>
          ))}
          {workspace.repos.length > 0 &&
            !workspace.repos.some((r) =>
              r.name.toLowerCase().includes(repoQuery.toLowerCase()),
            ) && <p className="no-repos">No matching repositories</p>}
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
                {indexPending[active] ? (
                  <>
                    <LoaderCircle size={12} className="spin" />
                    Saving index…
                  </>
                ) : busy ? (
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
                key={`${active}:${tab}`}
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
                          <Select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                          >
                            <option value="all">All branches</option>
                            {data.branches.map((b) => (
                              <option key={b.name}>{b.name}</option>
                            ))}
                          </Select>
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
                        <ResizeHandle
                          label="Resize changed files pane"
                          value={preferences.filesWidth}
                          min={220}
                          max={600}
                          onChange={(value) =>
                            setPreferences((p) => ({ ...p, filesWidth: value }))
                          }
                          onReset={() =>
                            setPreferences((p) => ({
                              ...p,
                              filesWidth: defaults.filesWidth,
                            }))
                          }
                        />
                        <div className="panel-title">
                          <strong>
                            Changed files <span>{data.files.length}</span>
                          </strong>
                          <button
                            disabled={
                              !!busy ||
                              !data.files.some((f) => f.worktree !== " ")
                            }
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
                              !!indexPending[active] ||
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
                    <ResizeHandle
                      label="Resize graph inspector"
                      direction={-1}
                      value={preferences.inspectorWidth}
                      min={200}
                      max={480}
                      onChange={(value) =>
                        setPreferences((p) => ({ ...p, inspectorWidth: value }))
                      }
                      onReset={() =>
                        setPreferences((p) => ({
                          ...p,
                          inspectorWidth: defaults.inspectorWidth,
                        }))
                      }
                    />
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
            <button
              className="status-branch-button"
              aria-label="Switch branch from bottom bar"
              disabled={!!busy}
              onClick={() => showModal("checkout", "Switch branch")}
              title="Switch branch"
            >
              <GitBranch size={12} />
              <span>{data.branch}</span>
              <ChevronDown size={11} />
            </button>
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
      {groupMenu && (
        <RepoContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          name={groupMenu.name}
          onClose={closeGroupMenu}
          actions={[
            {
              label: "Rename group",
              icon: <Settings2 size={14} />,
              onClick: () =>
                showModal(
                  "group-rename",
                  "Rename repository group",
                  groupMenu.name,
                ),
            },
            {
              label: "Remove group",
              icon: <Trash2 size={14} />,
              disabled: workspace.groups.length < 2,
              danger: true,
              onClick: () =>
                showModal(
                  "group-remove",
                  "Remove repository group?",
                  groupMenu.name,
                ),
            },
          ]}
        />
      )}
      {contextMenu && (
        <RepoContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          name={contextMenu.repo.name}
          onClose={closeContextMenu}
          actions={[
            {
              label: "Open repository",
              icon: <FolderGit2 size={15} />,
              onClick: () => setActive(contextMenu.repo.path),
            },
            {
              label: "Open in VS Code",
              icon: <Code2 size={15} />,
              disabled: !!busy,
              onClick: () => void run("open-editor", [], contextMenu.repo.path),
            },
            {
              label: "Reveal in file manager",
              icon: <Folder size={15} />,
              disabled: !!busy,
              onClick: () => void run("reveal", [], contextMenu.repo.path),
            },
            {
              label: "Fetch remotes",
              icon: <RefreshCw size={15} />,
              disabled: !!busy,
              onClick: () => void run("fetch", [], contextMenu.repo.path),
            },
            {
              label: "Copy repository path",
              icon: <Copy size={15} />,
              onClick: () =>
                void navigator.clipboard
                  .writeText(contextMenu.repo.path)
                  .then(() => setToast("Repository path copied"))
                  .catch((e) => setError(String(e))),
            },
            {
              label: "Rename in sidebar",
              icon: <Settings2 size={15} />,
              onClick: () =>
                showModal(
                  "organize",
                  "Rename repository",
                  contextMenu.repo.path,
                ),
            },
            {
              label: "Remove from workspace",
              icon: <Trash2 size={15} />,
              danger: true,
              onClick: () =>
                showModal(
                  "remove-repo",
                  "Remove from workspace?",
                  contextMenu.repo.path,
                ),
            },
          ]}
        />
      )}
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
                    <span>{basename(r.path)}</span>
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
                <div className="preference-section">
                  <h3>APP UPDATES</h3>
                  <p>Installed version: {packageInfo.version}</p>
                  <p>
                    {updates.version
                      ? `Version ${updates.version} is available.`
                      : updates.phase === "checking"
                        ? "Checking for updates…"
                        : updates.checked && !updates.error
                          ? "You’re up to date."
                          : "Checks on startup and every 30 minutes."}
                  </p>
                  {updates.error && (
                    <p className="fetch-error-text" role="alert">
                      Could not check or install the update: {updates.error}
                    </p>
                  )}
                  {updates.version ? (
                    <button
                      type="button"
                      className="primary"
                      disabled={updateDisabled}
                      onClick={applyUpdate}
                    >
                      <ArrowDownToLine size={14} />
                      {updateLabel}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={updates.phase === "checking" || !desktop}
                      onClick={() => void updates.checkNow()}
                    >
                      <RefreshCw size={14} />
                      Check for updates
                    </button>
                  )}
                </div>
                <div className="preference-section">
                  <h3>APPEARANCE</h3>
                  <label>
                    Interface font
                    <Select
                      value={preferences.fontFamily}
                      onChange={(e) =>
                        setPreferences((p) => ({
                          ...p,
                          fontFamily: e.target.value,
                        }))
                      }
                    >
                      <option value={'"Segoe UI", system-ui, sans-serif'}>
                        Segoe UI
                      </option>
                      <option value="Inter, system-ui, sans-serif">
                        Inter
                      </option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="system-ui, sans-serif">
                        System default
                      </option>
                      <option value="Consolas, monospace">Consolas</option>
                    </Select>
                  </label>
                  <label>
                    Font size{" "}
                    <span className="preference-value">
                      {preferences.fontSize}px
                    </span>
                    <input
                      aria-label="Font size"
                      type="range"
                      min="10"
                      max="18"
                      step="1"
                      value={preferences.fontSize}
                      onChange={(e) =>
                        setPreferences((p) => ({
                          ...p,
                          fontSize: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.animations}
                      onChange={(e) =>
                        setPreferences((p) => ({
                          ...p,
                          animations: e.target.checked,
                        }))
                      }
                    />
                    Subtle interface animations
                  </label>
                </div>
                <div className="preference-section">
                  <h3>BACKGROUND FETCH</h3>
                  <label>
                    Fetch interval
                    <Select
                      value={preferences.fetchMinutes}
                      onChange={(e) =>
                        setPreferences((p) => ({
                          ...p,
                          fetchMinutes: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Off</option>
                      {[1, 3, 5, 10, 15].map((n) => (
                        <option key={n} value={n}>
                          Every {n} minute{n === 1 ? "" : "s"}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p>
                    Fetches your registered repositories while Orbital is open.
                    Working files and your current branch stay in place.
                  </p>
                  {lastFetched[active] && (
                    <p>
                      Last fetched:{" "}
                      {new Date(lastFetched[active]).toLocaleTimeString()}
                    </p>
                  )}
                  {Object.entries(fetchErrors)
                    .filter(([, value]) => value)
                    .map(([path, value]) => (
                      <p className="fetch-error-text" key={path}>
                        {basename(path)}: {value}
                      </p>
                    ))}
                </div>
                <div className="preference-section">
                  <h3>WORKSPACE</h3>
                  <p>
                    Drag a pane divider to resize. Use arrow keys for precise
                    adjustments; double-click to reset a pane.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setPreferences((p) => ({
                        ...p,
                        sidebarWidth: defaults.sidebarWidth,
                        filesWidth: defaults.filesWidth,
                        inspectorWidth: defaults.inspectorWidth,
                      }))
                    }
                  >
                    Reset pane sizes
                  </button>
                </div>
                <div className="shortcut-row">
                  <span>Command palette</span>
                  <kbd>Ctrl K</kbd>
                </div>
                <div className="shortcut-row">
                  <span>Refresh repository</span>
                  <kbd>Ctrl R</kbd>
                </div>
                <p className="muted">
                  Version {packageInfo.version} · Tauri + Rust · Settings save
                  automatically.
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setModal(null)}
                >
                  Done
                </button>
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
                  "group-remove",
                  "stash-drop",
                  "remove-repo",
                  "revert",
                  "cherry-pick",
                ].includes(modal.kind) ? (
                  <div className="confirm-copy">
                    <p>
                      {modal.kind === "group-remove"
                        ? `Repositories in this group will move to ${workspace.groups.find((g) => g !== modal.value) ?? "another group"}. Repository files stay on disk.`
                        : modal.kind === "worktree-remove"
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
                      <Select
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
                      </Select>
                    </label>
                  </>
                ) : (
                  <>
                    {modal.kind === "worktree" && (
                      <label>
                        Branch mode
                        <Select
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
                        </Select>
                      </label>
                    )}
                    <label>
                      {["group-add", "group-rename"].includes(modal.kind)
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
                        <Select
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
                        </Select>
                      ) : (
                        <input
                          autoFocus
                          required={modal.kind !== "stash"}
                          value={
                            form.value ??
                            (modal.kind === "organize"
                              ? (modalRepo?.name ?? "")
                              : modal.kind === "group-rename"
                                ? (modal.value ?? "")
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
                    {["add", "init", "clone", "organize"].includes(
                      modal.kind,
                    ) && (
                      <label>
                        Repository group
                        <Select
                          value={
                            form.group ??
                            (modal.kind === "organize"
                              ? modalRepo?.group
                              : workspace.groups[0])
                          }
                          onChange={(e) =>
                            setForm({ ...form, group: e.target.value })
                          }
                        >
                          {workspace.groups.map((group) => (
                            <option key={group}>{group}</option>
                          ))}
                        </Select>
                      </label>
                    )}
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
                          <Select
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
                          </Select>
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
                        showModal(
                          "remove-repo",
                          "Remove from workspace?",
                          modalRepo?.path,
                        )
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

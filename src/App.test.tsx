// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api } from "./api";
import { demoSnapshot, demoWorkspace } from "./demo";
import { optimisticIndex } from "./index-state";
import { preferenceKey } from "./preferences";
import type { Snapshot } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  api: {
    load: vi.fn(),
    save: vi.fn(),
    snapshot: vi.fn(),
    workingState: vi.fn(),
    execute: vi.fn(),
    diff: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  const states = new Map<string, Snapshot>();
  const state = (path: string) => {
    if (!states.has(path)) states.set(path, demoSnapshot(path));
    return states.get(path)!;
  };
  vi.mocked(api.load).mockResolvedValue(structuredClone(demoWorkspace));
  vi.mocked(api.save).mockResolvedValue(undefined);
  vi.mocked(api.snapshot).mockImplementation(async (path) =>
    structuredClone(state(path)),
  );
  vi.mocked(api.workingState).mockImplementation(async (path) =>
    structuredClone(state(path)),
  );
  vi.mocked(api.execute).mockImplementation(async (path, action, args = []) => {
    if (["stage", "unstage", "stage-all"].includes(action))
      state(path).files = optimisticIndex(state(path).files, action, args[0]);
    return action === "compare" ? "0\t2" : "Done";
  });
  vi.mocked(api.diff).mockResolvedValue("@@ -1 +1 @@\n-before\n+after");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function start() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Stage all" });
  return user;
}
describe("desktop workflows", () => {
  it("clones into a non-repository parent and adds the resulting repository", async () => {
    const user = await start();
    vi.mocked(api.snapshot).mockImplementation(async (path) => {
      if (path === "D:/projects") throw new Error("not a repository");
      return demoSnapshot(path);
    });
    await user.click(
      screen.getByRole("button", { name: /Jump to a repository/ }),
    );
    await user.click(screen.getByRole("button", { name: "Clone repository" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Remote URL"),
      "https://example.com/team/new-repo.git",
    );
    await user.type(
      within(dialog).getByLabelText("Parent directory"),
      "D:/projects",
    );
    await user.type(
      within(dialog).getByLabelText("New folder name"),
      "new-repo",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Clone repository" }),
    );
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith("D:/projects", "clone", [
        "https://example.com/team/new-repo.git",
        "D:/projects/new-repo",
      ]),
    );
    await screen.findByRole("button", { name: /^new-repo/ });
    expect(api.snapshot).not.toHaveBeenCalledWith("D:/projects");
  });
  it("switches repositories and displays their branch status", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: /^design-system/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stage all" })).toBeTruthy(),
    );
    await waitFor(() =>
      expect(api.snapshot).toHaveBeenCalledWith("/demo/design-system"),
    );
    expect(screen.getAllByText("feature/tokens").length).toBeGreaterThan(0);
  });
  it("filters commit history by search text", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: "Graph" }));
    await user.type(
      screen.getByPlaceholderText("Search commits, authors, or SHA…"),
      "Handle empty",
    );
    expect(
      screen.getByText("Handle empty repositories gracefully"),
    ).toBeTruthy();
    expect(screen.queryByText("Initial project structure")).toBeNull();
  });
  it("reloads a file diff when the already-selected file is clicked again", async () => {
    const user = await start();
    const button = screen.getByRole("button", {
      name: /src\/styles\/tokens.css/,
    });
    await user.click(button);
    await screen.findByText("+after");
    vi.mocked(api.diff).mockResolvedValueOnce("+newer content");
    await user.click(button);
    await screen.findByText("+newer content");
    expect(screen.queryByText("Loading diff…")).toBeNull();
  });
  it("previews and merges the chosen branch into the active branch", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: "Merge branch" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox"),
      "feature/worktrees",
    );
    await within(dialog).findByText(/2 commits to bring in/);
    await user.click(
      within(dialog).getByRole("button", { name: "Merge into main" }),
    );
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith("/demo/orbital", "merge", [
        "feature/worktrees",
      ]),
    );
  });
  it("stages a file, previews its diff, and opens the staged diff in VS Code", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: /Changes 3/ }));
    await user.click(screen.getAllByRole("button", { name: "Stage file" })[0]);
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith("/demo/orbital", "stage", [
        "src/components/RepositorySidebar.tsx",
      ]),
    );
    await user.click(
      screen.getByRole("button", { name: /src\/styles\/tokens.css/ }),
    );
    await screen.findByText("+after");
    await user.click(screen.getByRole("button", { name: "VS Code" }));
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith("/demo/orbital", "open-diff", [
        "src/styles/tokens.css",
        "",
        "staged",
      ]),
    );
  });
  it("creates an independent worktree with a new branch", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: /Worktrees 2/ }));
    await user.click(screen.getByRole("button", { name: "New worktree" }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Worktree folder path"),
      "D:/work/parallel",
    );
    await user.type(
      within(dialog).getByLabelText("Branch name"),
      "feature/parallel",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create worktree" }),
    );
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith(
        "/demo/orbital",
        "worktree-add",
        ["D:/work/parallel", "feature/parallel", "new"],
      ),
    );
  });
  it("surfaces Git errors without reporting a successful operation", async () => {
    const user = await start();
    vi.mocked(api.execute).mockRejectedValueOnce(
      new Error("Authentication failed"),
    );
    await user.click(screen.getByRole("button", { name: /Fetch/ }));
    await screen.findByText("Error: Authentication failed");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("opens Changes by default and removes legacy group controls without losing repos", async () => {
    vi.mocked(api.load).mockResolvedValue({
      ...structuredClone(demoWorkspace),
      groups: ["Old group"],
    } as typeof demoWorkspace);
    await start();
    expect(
      screen.getByRole("heading", { name: "Working changes" }),
    ).toBeTruthy();
    expect(screen.queryByText("Old group")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create repository group" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^rust-utils/ })).toBeTruthy();
    expect(api.snapshot).toHaveBeenCalledTimes(1);
  });
  it("moves files immediately, serializes staging, and never reloads history or shows update toasts", async () => {
    const user = await start();
    const calls = vi.mocked(api.snapshot).mock.calls.length;
    let finish!: () => void;
    const waiting = new Promise<string>((resolve) => {
      finish = () => resolve("");
    });
    const original = vi.mocked(api.execute).getMockImplementation()!;
    vi.mocked(api.execute).mockImplementationOnce(async (...args) => {
      await waiting;
      return original(...args);
    });
    await user.click(screen.getAllByRole("button", { name: "Stage file" })[0]);
    const stagedHeader = screen.getByText("Staged changes").parentElement!;
    expect(stagedHeader.textContent).toContain("RepositorySidebar.tsx");
    await user.click(screen.getByRole("button", { name: "Stage file" }));
    expect(api.execute).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(api.execute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Saving index…")).toBeNull());
    expect(api.snapshot).toHaveBeenCalledTimes(calls);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("restores the actual file state after a failed optimistic stage", async () => {
    const user = await start();
    vi.mocked(api.execute).mockRejectedValueOnce(new Error("Index is locked"));
    await user.click(screen.getAllByRole("button", { name: "Stage file" })[0]);
    await screen.findByText("Error: Index is locked");
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Stage file" }),
      ).toHaveLength(2),
    );
  });
  it("does not wait for or apply an old status response after staging", async () => {
    const user = await start();
    await waitFor(() => expect(api.workingState).toHaveBeenCalledTimes(4));
    let finishStale!: (value: Snapshot) => void;
    vi.mocked(api.workingState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStale = resolve;
        }),
    );
    fireEvent(window, new Event("focus"));
    await user.click(screen.getAllByRole("button", { name: "Stage file" })[0]);
    await waitFor(() => expect(screen.queryByText("Saving index…")).toBeNull());
    expect(
      screen.getByText("Staged changes").parentElement?.textContent,
    ).toContain("RepositorySidebar.tsx");
    await act(async () => {
      finishStale(demoSnapshot("/demo/orbital"));
    });
    expect(
      screen.getByText("Staged changes").parentElement?.textContent,
    ).toContain("RepositorySidebar.tsx");
    expect(api.snapshot).toHaveBeenCalledTimes(1);
  });
  it("targets the right-clicked repo for editor actions without changing the active repository", async () => {
    const user = await start();
    await user.pointer({
      target: screen.getByRole("button", { name: /design-systemfeature/ }),
      keys: "[MouseRight]",
    });
    const menu = screen.getByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Open in VS Code" }),
    );
    await waitFor(() =>
      expect(api.execute).toHaveBeenCalledWith(
        "/demo/design-system",
        "open-editor",
        [],
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Working changes" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /orbitalmain/ }).className,
    ).toContain("active");
  });
  it("resizes a pane with the keyboard and persists appearance preferences", async () => {
    const user = await start();
    const divider = screen.getByRole("separator", {
      name: "Resize repository sidebar",
    });
    divider.focus();
    await user.keyboard("{ArrowRight}");
    expect(divider.getAttribute("aria-valuenow")).toBe("252");
    await user.click(screen.getByRole("button", { name: /Preferences/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByLabelText("Interface font"),
      "Arial, sans-serif",
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Fetch interval"),
      "3",
    );
    fireEvent.change(
      within(dialog).getByRole("slider", { name: "Font size" }),
      { target: { value: "16" } },
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(preferenceKey) ?? "{}").fetchMinutes,
      ).toBe(3),
    );
    expect(document.documentElement.style.getPropertyValue("--ui-font")).toBe(
      "Arial, sans-serif",
    );
    expect(
      document.documentElement.style.getPropertyValue("--ui-font-size"),
    ).toBe("16px");
    expect(JSON.parse(localStorage.getItem(preferenceKey)!).sidebarWidth).toBe(
      252,
    );
  });
  it("fetches periodically without toasts, prevents overlapping cycles, and can turn fetching off", async () => {
    vi.useFakeTimers();
    localStorage.setItem(preferenceKey, JSON.stringify({ fetchMinutes: 1 }));
    await act(async () => {
      render(<App />);
    });
    let finish!: (value: string) => void;
    vi.mocked(api.execute).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api.execute).toHaveBeenCalledTimes(1);
    expect(api.execute).toHaveBeenCalledWith("/demo/orbital", "fetch", []);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api.execute).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish("");
    });
    expect(api.execute).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Preferences/ }));
    fireEvent.change(screen.getByLabelText("Fetch interval"), {
      target: { value: "0" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(api.execute).toHaveBeenCalledTimes(4);
  });
  it("removes the right-clicked repository without changing another active repository", async () => {
    const user = await start();
    await user.click(
      screen.getByRole("button", { name: "Options for rust-utils" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Remove from workspace" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirm",
      }),
    );
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({
        repos: demoWorkspace.repos.filter((r) => r.name !== "rust-utils"),
      }),
    );
    expect(
      screen.getByRole("button", { name: /^orbitalmain/ }).className,
    ).toContain("active");
    expect(
      screen.queryByRole("button", { name: "Options for rust-utils" }),
    ).toBeNull();
  });
});

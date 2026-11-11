// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api } from "./api";
import { demoSnapshot, demoWorkspace } from "./demo";

vi.mock("./api", () => ({
  desktop: true,
  api: {
    load: vi.fn(),
    save: vi.fn(),
    snapshot: vi.fn(),
    execute: vi.fn(),
    diff: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
beforeEach(() => {
  vi.mocked(api.load).mockResolvedValue(structuredClone(demoWorkspace));
  vi.mocked(api.save).mockResolvedValue(undefined);
  vi.mocked(api.snapshot).mockImplementation(async (path) =>
    demoSnapshot(path),
  );
  vi.mocked(api.execute).mockImplementation(async (_path, action) =>
    action === "compare" ? "0\t2" : "Done",
  );
  vi.mocked(api.diff).mockResolvedValue("@@ -1 +1 @@\n-before\n+after");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function start() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: /Working directory/ });
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
    await screen.findByRole("button", { name: /new-repo/ });
    expect(api.snapshot).not.toHaveBeenCalledWith("D:/projects");
  });
  it("switches repositories and displays their branch status", async () => {
    const user = await start();
    await user.click(screen.getByRole("button", { name: /design-system/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Working directory/ }),
      ).toBeTruthy(),
    );
    expect(api.snapshot).toHaveBeenCalledWith("/demo/design-system");
    expect(screen.getAllByText("feature/tokens").length).toBeGreaterThan(0);
  });
  it("filters commit history by search text", async () => {
    const user = await start();
    await user.type(
      screen.getByPlaceholderText("Search commits, authors, or SHA…"),
      "Handle empty",
    );
    expect(
      screen.getByText("Handle empty repositories gracefully"),
    ).toBeTruthy();
    expect(screen.queryByText("Initial project structure")).toBeNull();
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
});

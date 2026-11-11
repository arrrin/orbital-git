<img src="assets/icon.svg" width="64" height="64" alt="Orbital icon">

# Orbital

A local, graph-first desktop Git client built with **Rust + Tauri 2 + React**. Inspired by the clarity of GitKraken and GitHub Desktop, with an original interface.

## Included

- Colored commit ancestry graph with merge lanes, branch and tag labels, author/SHA search, branch filtering, commit details, and file diffs.
- Persistent repository groups, fast sidebar switching, current branch, uncommitted file count, ahead/behind indicators, and background refresh every 15 seconds.
- Open, initialize, and clone repositories; organize or remove them from the workspace without deleting repository files.
- Fetch all remotes, fast-forward pull, and push. Publishing a branch sets its upstream; existing upstreams use your Git push configuration.
- Create and switch branches, track remote branches, merge another branch into the current branch with a commit-count preview, rebase, and safely delete merged local branches.
- Stage/unstage individual files, stage all, write commits, preview staged and unstaged diffs, and inspect historical changes.
- Open repositories and diffs in VS Code. Unstaged diffs open the real working file for editing. Staged and historical diffs use snapshots.
- Create worktrees with new or existing branches, open them as repositories or in VS Code, and remove clean worktrees. Git refuses to delete dirty worktrees.
- Stash tracked and untracked changes, apply a stash while preserving it, and explicitly delete stashes.
- Tags, cherry-pick, revert, conflict indicators, and continue/abort controls for merge, rebase, and cherry-pick operations.
- Keyboard command palette (`Ctrl/Cmd K`), repository refresh (`Ctrl/Cmd R`), keyboard focus containment in dialogs, loading states, and Git error reporting.

## Run

Requires Node.js 24+, stable Rust, Git on PATH, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows, install **Visual Studio Build Tools → Desktop development with C++**, including the Windows SDK, plus WebView2 Runtime. VS Code alone does not provide the C++ linker.

```powershell
npm ci
npm run desktop
```

To explore the interface in a browser:

```powershell
npm run dev
```

Open `http://localhost:1420`. The browser uses clearly labeled sample repositories; local Git operations require the desktop app. Browser demo data is not saved to your desktop workspace.

## Build and verify

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

The Windows installer is generated in `src-tauri/target/release/bundle/nsis/`. The GitHub Actions workflow runs frontend checks, Rust tests, and the Windows installer build, then uploads the installer as an artifact. It runs when the project is pushed to GitHub or manually dispatched; no CI run is implied by having the workflow file.

On Linux, use `cargo build --manifest-path src-tauri/Cargo.toml` after building the frontend. The configured installer target is Windows NSIS; use an appropriate Tauri bundle target when packaging for other platforms.

## Git behavior

The Rust service runs your installed Git using argument arrays, without constructing shell commands. It inherits your existing Git identity, hooks, SSH setup, signing settings, and credential manager. Terminal credential prompting is disabled so a background command cannot wait for an invisible password prompt. Configure authentication with Git or your credential manager before fetching or pushing private repositories.

Pull is fast-forward only. For diverged branches, explicitly merge or rebase from the command palette. No force-push, hard reset, or automatic discard of changes is exposed. Merge conflicts remain in the working tree: open the repository in VS Code, resolve files, stage them in Changes, and continue the operation.

Repository groups are stored in `workspace.json` in Tauri's per-user application config directory. Diff snapshots live under your system temporary directory in `orbital-diffs`. Workspace removal keeps the repository on disk; worktree removal actually removes that worktree directory after Git's safety checks.

## Current limits

This is an initial desktop implementation, not complete GitKraken feature parity. History currently loads the most recent 500 commits. File-level staging and text diffs are supported; hunk staging, blame, Git LFS management, submodule management, hosting-provider pull requests, interactive rebase editing, and a built-in three-way conflict editor are not yet included. VS Code must be installed in its standard location on Windows, or available as `code` on PATH on Linux/macOS.

## Project layout

`src-tauri/src/git.rs` owns Git operations and temporary-repository integration tests. `src-tauri/src/main.rs` exposes async desktop commands and workspace persistence. `src/graph.ts` calculates graph lanes and ancestry edges. `src/App.tsx` contains the desktop UI; `src/api.ts` is the Tauri bridge and explicit browser-demo boundary.

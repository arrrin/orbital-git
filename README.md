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

## Release on GitHub

The repository remote is `https://github.com/arrrin/orbital-git`. The `Release Windows` workflow builds on GitHub's Windows runner when you push a version tag. It checks that the tag matches all application version fields, runs tests, builds an NSIS installer, and attaches it to a **draft** GitHub release. No personal access token is needed: the workflow uses GitHub's built-in token with `contents: write` permission. Repository or organization policy must allow GitHub Actions to run.

For the first release, commit the workflow and source changes before pushing the tag:

```powershell
git add .
git commit -m "Set up versioned Windows releases"
git push origin main
git tag -a v0.1.0 -m "Orbital 0.1.0"
git push origin v0.1.0
```

Watch the build under [Actions](https://github.com/arrrin/orbital-git/actions). Once it succeeds, open [Releases](https://github.com/arrrin/orbital-git/releases), edit the draft, review the notes and attached installer, and click **Publish release**. Users download the `.exe` from the release's Assets section. If a build fails, open the failed job, fix the issue, and make a new version; do not move an already published version tag.

For the next version:

```powershell
npm run release:version -- 0.1.1
npm run version:check
npm test
git add .
git commit -m "Release 0.1.1"
git push origin main
git tag -a v0.1.1 -m "Orbital 0.1.1"
git push origin v0.1.1
```

`release:version` updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the application's entry in `src-tauri/Cargo.lock`. The UI reads its version from `package.json`. Use `0.1.1` for fixes, `0.2.0` for a new feature release, and `1.0.0` for a stable milestone. The version helper currently supports stable `major.minor.patch` numbers. Each published version gets a new tag and release; old downloads remain available.

These releases provide downloadable installers. Automatic in-app updates and Windows code signing are not configured. Users install a newer release by downloading and running its installer. GitHub release automation does not require the local Microsoft C++ Build Tools installation.

## Git behavior

The Rust service runs your installed Git using argument arrays, without constructing shell commands. It inherits your existing Git identity, hooks, SSH setup, signing settings, and credential manager. Terminal credential prompting is disabled so a background command cannot wait for an invisible password prompt. Configure authentication with Git or your credential manager before fetching or pushing private repositories.

Pull is fast-forward only. For diverged branches, explicitly merge or rebase from the command palette. No force-push, hard reset, or automatic discard of changes is exposed. Merge conflicts remain in the working tree: open the repository in VS Code, resolve files, stage them in Changes, and continue the operation.

Repository groups are stored in `workspace.json` in Tauri's per-user application config directory. Diff snapshots live under your system temporary directory in `orbital-diffs`. Workspace removal keeps the repository on disk; worktree removal actually removes that worktree directory after Git's safety checks.

## Current limits

This is an initial desktop implementation, not complete GitKraken feature parity. History currently loads the most recent 500 commits. File-level staging and text diffs are supported; hunk staging, blame, Git LFS management, submodule management, hosting-provider pull requests, interactive rebase editing, and a built-in three-way conflict editor are not yet included. VS Code must be installed in its standard location on Windows, or available as `code` on PATH on Linux/macOS.

## Project layout

`src-tauri/src/git.rs` owns Git operations and temporary-repository integration tests. `src-tauri/src/main.rs` exposes async desktop commands and workspace persistence. `src/graph.ts` calculates graph lanes and ancestry edges. `src/App.tsx` contains the desktop UI; `src/api.ts` is the Tauri bridge and explicit browser-demo boundary.

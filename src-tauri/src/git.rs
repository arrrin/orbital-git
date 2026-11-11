use serde::Serialize;
use std::{
    path::{Component, Path},
    process::{Command, Output},
};

#[derive(Serialize)]
pub struct Commit {
    hash: String,
    parents: Vec<String>,
    author: String,
    email: String,
    date: String,
    subject: String,
    refs: Vec<String>,
}
#[derive(Serialize)]
pub struct FileStatus {
    path: String,
    index: String,
    worktree: String,
    conflict: bool,
}
#[derive(Serialize)]
pub struct Branch {
    name: String,
    current: bool,
    upstream: String,
    remote: bool,
}
#[derive(Serialize)]
pub struct Worktree {
    path: String,
    branch: String,
    head: String,
}
#[derive(Serialize)]
pub struct Snapshot {
    path: String,
    branch: String,
    upstream: String,
    ahead: usize,
    behind: usize,
    files: Vec<FileStatus>,
    commits: Vec<Commit>,
    branches: Vec<Branch>,
    worktrees: Vec<Worktree>,
    stashes: Vec<String>,
    remotes: Vec<String>,
    tags: Vec<String>,
    operation: String,
}

fn output(path: &str, args: &[&str]) -> Result<Output, String> {
    let mut cmd = Command::new("git");
    cmd.args(["--literal-pathspecs", "-c", "core.quotepath=false"])
        .arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output()
        .map_err(|e| format!("Could not run Git. Install Git and add it to PATH: {e}"))
}
fn git(path: &str, args: &[&str]) -> Result<String, String> {
    let out = output(path, args)?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout)
            .trim_end_matches(['\r', '\n'])
            .to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}
fn valid_ref(value: &str) -> Result<(), String> {
    if value.is_empty() || value.starts_with('-') || value.contains('\0') {
        Err("Choose a valid Git reference".into())
    } else {
        Ok(())
    }
}
fn valid_file(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.contains(':')
        || value
            .split(['/', '\\'])
            .any(|part| part == ".." || part == ".")
        || Path::new(value)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        Err("File must be relative to the repository".into())
    } else {
        Ok(())
    }
}
pub fn snapshot(path: &str) -> Result<Snapshot, String> {
    let root = git(path, &["rev-parse", "--show-toplevel"])?;
    let branch =
        git(path, &["symbolic-ref", "--short", "HEAD"]).unwrap_or_else(|_| "Detached HEAD".into());
    let upstream = git(path, &["rev-parse", "--abbrev-ref", "@{upstream}"]).unwrap_or_default();
    let counts = git(
        path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .unwrap_or_default();
    let mut counts = counts.split_whitespace().filter_map(|x| x.parse().ok());
    let ahead = counts.next().unwrap_or(0);
    let behind = counts.next().unwrap_or(0);
    let raw = output(
        path,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    if !raw.status.success() {
        return Err(String::from_utf8_lossy(&raw.stderr).to_string());
    }
    let raw = String::from_utf8_lossy(&raw.stdout);
    let mut entries = raw.split('\0');
    let mut files = vec![];
    while let Some(line) = entries.next() {
        if line.len() < 4 {
            continue;
        }
        let index = &line[0..1];
        let worktree = &line[1..2];
        files.push(FileStatus {
            path: line[3..].into(),
            index: index.into(),
            worktree: worktree.into(),
            conflict: matches!(&line[..2], "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU"),
        });
        if index == "R" || index == "C" || worktree == "R" || worktree == "C" {
            entries.next();
        }
    }
    let log = git(
        path,
        &[
            "log",
            "--all",
            "--topo-order",
            "-n",
            "500",
            "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e",
        ],
    )
    .unwrap_or_default();
    let commits = log
        .split('\x1e')
        .filter_map(|row| {
            let f: Vec<_> = row.trim().split('\x1f').collect();
            if f.len() < 7 {
                return None;
            }
            Some(Commit {
                hash: f[0].into(),
                parents: f[1].split_whitespace().map(String::from).collect(),
                author: f[2].into(),
                email: f[3].into(),
                date: f[4].into(),
                subject: f[5].into(),
                refs: f[6]
                    .split(", ")
                    .filter(|x| !x.is_empty())
                    .map(String::from)
                    .collect(),
            })
        })
        .collect();
    let branches = git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(refname)",
            "refs/heads",
            "refs/remotes",
        ],
    )?
    .lines()
    .filter_map(|row| {
        let f: Vec<_> = row.split('\t').collect();
        if f.len() < 4 {
            return None;
        }
        Some(Branch {
            name: f[0].into(),
            current: f[1] == "*",
            upstream: f[2].into(),
            remote: f[3].starts_with("refs/remotes/"),
        })
    })
    .collect();
    let wt = git(path, &["worktree", "list", "--porcelain"])?;
    let worktrees = wt
        .split("\n\n")
        .filter(|x| !x.trim().is_empty())
        .map(|block| {
            let get = |prefix: &str| {
                block
                    .lines()
                    .find_map(|l| l.strip_prefix(prefix))
                    .unwrap_or("")
                    .to_string()
            };
            Worktree {
                path: get("worktree "),
                branch: get("branch ").trim_start_matches("refs/heads/").into(),
                head: get("HEAD "),
            }
        })
        .collect();
    let operation = [
        ("MERGE_HEAD", "merge"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
    ]
    .iter()
    .find_map(|(file, name)| {
        let file_path = git(path, &["rev-parse", "--git-path", file]).ok()?;
        let file_path = Path::new(&file_path);
        let full = if file_path.is_absolute() {
            file_path.to_path_buf()
        } else {
            Path::new(path).join(file_path)
        };
        full.exists().then(|| name.to_string())
    })
    .unwrap_or_default();
    Ok(Snapshot {
        path: root,
        branch,
        upstream,
        ahead,
        behind,
        files,
        commits,
        branches,
        worktrees,
        stashes: git(path, &["stash", "list"])
            .unwrap_or_default()
            .lines()
            .map(String::from)
            .collect(),
        remotes: git(path, &["remote", "-v"])
            .unwrap_or_default()
            .lines()
            .map(String::from)
            .collect(),
        tags: git(path, &["tag"])
            .unwrap_or_default()
            .lines()
            .map(String::from)
            .collect(),
        operation,
    })
}
pub fn diff(
    path: &str,
    file: &str,
    revision: Option<&str>,
    staged: bool,
) -> Result<String, String> {
    valid_file(file)?;
    if let Some(rev) = revision {
        valid_ref(rev)?;
        let parent = format!("{rev}^");
        if git(path, &["rev-parse", "--verify", &parent]).is_ok() {
            return git(
                path,
                &[
                    "diff",
                    "--no-ext-diff",
                    "--no-textconv",
                    &parent,
                    rev,
                    "--",
                    file,
                ],
            );
        }
        return git(
            path,
            &[
                "show",
                "--format=",
                "--no-ext-diff",
                "--no-textconv",
                rev,
                "--",
                file,
            ],
        );
    }
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", file]);
    let result = git(path, &args)?;
    if result.is_empty() && git(path, &["ls-files", "--error-unmatch", "--", file]).is_err() {
        let canonical_root = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        let canonical =
            std::fs::canonicalize(Path::new(path).join(file)).map_err(|e| e.to_string())?;
        if !canonical.starts_with(canonical_root) {
            return Err("File points outside the repository".into());
        }
        let bytes = std::fs::read(canonical).map_err(|e| e.to_string())?;
        if bytes.contains(&0) {
            return Ok("Binary file".into());
        }
        return Ok(String::from_utf8_lossy(&bytes)
            .lines()
            .map(|l| format!("+{l}\n"))
            .collect());
    }
    Ok(result)
}
pub fn execute(path: &str, action: &str, args: &[String]) -> Result<String, String> {
    let arg = |n: usize| {
        args.get(n)
            .map(String::as_str)
            .ok_or_else(|| "Missing required field".to_string())
    };
    if action == "init" {
        return git(path, &["init"]);
    }
    if action == "clone" {
        let url = arg(0)?;
        valid_ref(url)?;
        return git(path, &["clone", "--", url, arg(1)?]);
    }
    git(path, &["rev-parse", "--show-toplevel"])?;
    match action {
        "fetch" => git(path, &["fetch", "--all", "--prune"]),
        "pull" => git(path, &["pull", "--ff-only"]),
        "push" => {
            if git(path, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok() {
                return git(path, &["push"]);
            }
            let branch = git(path, &["symbolic-ref", "--short", "HEAD"])?;
            let remotes = git(path, &["remote"])?;
            let names: Vec<_> = remotes.lines().collect();
            let remote = if names.contains(&"origin") {
                "origin"
            } else if names.len() == 1 {
                names[0]
            } else {
                return Err("Choose a default remote in Git before publishing this branch".into());
            };
            git(path, &["push", "--set-upstream", remote, &branch])
        }
        "stage" | "unstage" => {
            let file = arg(0)?;
            valid_file(file)?;
            if action == "stage" {
                git(path, &["add", "--", file])
            } else if git(path, &["rev-parse", "--verify", "HEAD"]).is_ok() {
                git(path, &["restore", "--staged", "--", file])
            } else {
                git(path, &["rm", "--cached", "--", file])
            }
        }
        "stage-all" => git(path, &["add", "--all"]),
        "commit" => {
            let msg = arg(0)?;
            if msg.trim().is_empty() {
                return Err("A commit message is required".into());
            }
            git(path, &["commit", "-m", msg])
        }
        "checkout" | "branch" | "merge" | "rebase" | "branch-delete" | "cherry-pick" | "revert"
        | "tag" => {
            let reference = arg(0)?;
            valid_ref(reference)?;
            match action {
                "checkout" => {
                    if git(
                        path,
                        &["show-ref", "--verify", &format!("refs/remotes/{reference}")],
                    )
                    .is_ok()
                    {
                        git(path, &["switch", "--track", reference])
                    } else {
                        git(path, &["switch", reference])
                    }
                }
                "branch" => git(path, &["switch", "-c", reference]),
                "merge" => git(path, &["merge", "--no-edit", reference]),
                "rebase" => git(path, &["rebase", reference]),
                "branch-delete" => git(path, &["branch", "-d", reference]),
                "revert" => git(path, &["revert", "--no-edit", reference]),
                "tag" => git(path, &["tag", reference]),
                _ => git(path, &["cherry-pick", reference]),
            }
        }
        "remote-add" => {
            let name = arg(0)?;
            let url = arg(1)?;
            valid_ref(name)?;
            valid_ref(url)?;
            git(path, &["remote", "add", name, url])
        }
        "stash" => git(
            path,
            &[
                "stash",
                "push",
                "--include-untracked",
                "-m",
                args.first().map(String::as_str).unwrap_or("Orbital stash"),
            ],
        ),
        "stash-apply" | "stash-drop" => {
            let reference = arg(0)?;
            if !reference.starts_with("stash@{") || !reference.ends_with('}') {
                return Err("Invalid stash reference".into());
            }
            git(
                path,
                &[
                    "stash",
                    if action == "stash-apply" {
                        "apply"
                    } else {
                        "drop"
                    },
                    reference,
                ],
            )
        }
        "worktree-add" => {
            let branch = arg(1)?;
            valid_ref(branch)?;
            let mut cmd = vec!["worktree", "add"];
            if args.get(2).is_some_and(|s| s == "new") {
                cmd.extend(["-b", branch, "--", arg(0)?]);
            } else {
                cmd.extend(["--", arg(0)?, branch]);
            }
            git(path, &cmd)
        }
        "worktree-remove" => git(path, &["worktree", "remove", "--", arg(0)?]),
        "abort" => {
            let operation = arg(0)?;
            if !["merge", "rebase", "cherry-pick"].contains(&operation) {
                return Err("Unsupported operation".into());
            }
            git(path, &[operation, "--abort"])
        }
        "continue" => {
            let operation = arg(0)?;
            if !["merge", "rebase", "cherry-pick"].contains(&operation) {
                return Err("Unsupported operation".into());
            }
            let mut cmd = Command::new("git");
            cmd.arg("-C")
                .arg(path)
                .args([operation, "--continue"])
                .env("GIT_EDITOR", "true")
                .env("GIT_TERMINAL_PROMPT", "0");
            let result = cmd.output().map_err(|e| e.to_string())?;
            if result.status.success() {
                Ok(String::from_utf8_lossy(&result.stdout).into())
            } else {
                Err(String::from_utf8_lossy(&result.stderr).into())
            }
        }
        "commit-files" => {
            let rev = arg(0)?;
            valid_ref(rev)?;
            git(
                path,
                &[
                    "diff-tree",
                    "--root",
                    "--no-commit-id",
                    "--name-only",
                    "-z",
                    "-m",
                    "-r",
                    rev,
                ],
            )
        }
        "compare" => {
            let rev = arg(0)?;
            valid_ref(rev)?;
            git(
                path,
                &[
                    "rev-list",
                    "--left-right",
                    "--count",
                    &format!("HEAD...{rev}"),
                ],
            )
        }
        "open-editor" => launch_editor(path, None),
        "open-diff" => {
            let file = arg(0)?;
            valid_file(file)?;
            let staged = args.get(2).is_some_and(|s| s == "staged");
            let revision = args.get(1).filter(|s| !s.is_empty());
            let base = if let Some(rev) = revision {
                valid_ref(rev)?;
                format!("{rev}^:{file}")
            } else if staged {
                format!("HEAD:{file}")
            } else {
                format!(":{file}")
            };
            let old = output(path, &["show", &base])?;
            let folder = std::env::temp_dir().join("orbital-diffs").join(format!(
                "{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos()
            ));
            std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
            let name = Path::new(file)
                .file_name()
                .ok_or("Invalid file name")?
                .to_string_lossy();
            let left = folder.join(format!("before-{name}"));
            let right = folder.join(format!("after-{name}"));
            std::fs::write(
                &left,
                if old.status.success() {
                    old.stdout
                } else {
                    vec![]
                },
            )
            .map_err(|e| e.to_string())?;
            if let Some(rev) = revision {
                let out = output(path, &["show", &format!("{rev}:{file}")])?;
                std::fs::write(
                    &right,
                    if out.status.success() {
                        out.stdout
                    } else {
                        vec![]
                    },
                )
                .map_err(|e| e.to_string())?;
            } else if staged {
                let out = output(path, &["show", &format!(":{file}")])?;
                if !out.status.success() {
                    // A staged deletion has no blob in the index.
                    if !git(
                        path,
                        &[
                            "diff",
                            "--cached",
                            "--name-only",
                            "--diff-filter=D",
                            "--",
                            file,
                        ],
                    )?
                    .lines()
                    .any(|s| s == file)
                    {
                        return Err(String::from_utf8_lossy(&out.stderr).into());
                    }
                }
                std::fs::write(
                    &right,
                    if out.status.success() {
                        out.stdout
                    } else {
                        vec![]
                    },
                )
                .map_err(|e| e.to_string())?;
            } else {
                let root = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
                let target = Path::new(path).join(file);
                let bytes = if target.exists() {
                    let target = std::fs::canonicalize(target).map_err(|e| e.to_string())?;
                    if !target.starts_with(root) {
                        return Err("File points outside the repository".into());
                    }
                    return launch_editor(path, Some((&left, &target)));
                } else {
                    vec![]
                };
                std::fs::write(&right, bytes).map_err(|e| e.to_string())?;
            }
            launch_editor(path, Some((&left, &right)))
        }
        _ => Err("Unsupported Git action".into()),
    }
}
fn launch_editor(path: &str, files: Option<(&Path, &Path)>) -> Result<String, String> {
    // On Windows code.cmd needs cmd.exe; invoke the actual VS Code executable instead.
    #[cfg(windows)]
    let executable = [
        std::env::var("LOCALAPPDATA").unwrap_or_default() + "/Programs/Microsoft VS Code/Code.exe",
        "C:/Program Files/Microsoft VS Code/Code.exe".into(),
    ]
    .into_iter()
    .find(|p| Path::new(p).exists())
    .ok_or("VS Code was not found. Install VS Code in its standard location.")?;
    #[cfg(not(windows))]
    let executable = "code";
    let mut cmd = Command::new(executable);
    if let Some((left, right)) = files {
        cmd.arg("--diff").arg(left).arg(right);
    } else {
        cmd.arg(path);
    }
    cmd.spawn()
        .map_err(|e| format!("Could not open VS Code: {e}"))?;
    Ok("Opened in VS Code".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_option_refs_and_traversal() {
        assert!(valid_ref("--all").is_err());
        assert!(valid_file("../secret").is_err());
        assert!(valid_file("C:/secret").is_err());
        assert!(valid_file("src/main.rs").is_ok());
    }
    fn repository() -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        git(path, &["init", "-b", "main"]).unwrap();
        git(path, &["config", "user.name", "Orbital Tests"]).unwrap();
        git(path, &["config", "user.email", "test@orbital.local"]).unwrap();
        folder
    }
    fn call(path: &str, action: &str, args: &[&str]) -> Result<String, String> {
        execute(
            path,
            action,
            &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        )
    }
    fn commit_file(path: &str, name: &str, contents: &str) {
        std::fs::write(Path::new(path).join(name), contents).unwrap();
        call(path, "stage", &[name]).unwrap();
        call(path, "commit", &["Test commit"]).unwrap();
    }
    #[test]
    fn empty_repository_staging_commit_and_diff() {
        let folder = repository();
        let path = folder.path().to_str().unwrap();
        assert!(snapshot(path).unwrap().commits.is_empty());
        std::fs::write(folder.path().join("space name.txt"), "first\n").unwrap();
        assert_eq!(snapshot(path).unwrap().files[0].path, "space name.txt");
        call(path, "stage", &["space name.txt"]).unwrap();
        call(path, "unstage", &["space name.txt"]).unwrap();
        call(path, "stage", &["space name.txt"]).unwrap();
        call(path, "commit", &["Initial commit"]).unwrap();
        let state = snapshot(path).unwrap();
        assert_eq!(state.commits.len(), 1);
        assert!(state.files.is_empty());
        assert_eq!(state.branches.len(), 1);
        std::fs::write(folder.path().join("space name.txt"), "second\n").unwrap();
        assert!(diff(path, "space name.txt", None, false)
            .unwrap()
            .contains("+second"));
        call(path, "stage", &["space name.txt"]).unwrap();
        assert!(diff(path, "space name.txt", None, true)
            .unwrap()
            .contains("+second"));
    }
    #[test]
    fn branches_merge_and_worktree_lifecycle() {
        let folder = repository();
        let path = folder.path().to_str().unwrap();
        commit_file(path, "main.txt", "main");
        call(path, "branch", &["feature/test"]).unwrap();
        commit_file(path, "feature.txt", "feature");
        call(path, "checkout", &["main"]).unwrap();
        assert_eq!(call(path, "compare", &["feature/test"]).unwrap(), "0\t1");
        call(path, "merge", &["feature/test"]).unwrap();
        assert!(folder.path().join("feature.txt").exists());
        let parent = tempfile::tempdir().unwrap();
        let worktree = parent.path().join("parallel");
        let worktree = worktree.to_str().unwrap();
        call(path, "worktree-add", &[worktree, "parallel", "new"]).unwrap();
        assert_eq!(snapshot(path).unwrap().worktrees.len(), 2);
        std::fs::write(Path::new(worktree).join("untracked.txt"), "keep this").unwrap();
        assert!(call(path, "worktree-remove", &[worktree]).is_err());
        assert!(Path::new(worktree).join("untracked.txt").exists());
        commit_file(worktree, "untracked.txt", "keep this");
        call(path, "worktree-remove", &[worktree]).unwrap();
        assert_eq!(snapshot(path).unwrap().worktrees.len(), 1);
    }
    #[test]
    fn stash_preserves_work_and_conflicts_are_reported() {
        let folder = repository();
        let path = folder.path().to_str().unwrap();
        commit_file(path, "file.txt", "base\n");
        std::fs::write(folder.path().join("file.txt"), "saved work\n").unwrap();
        call(path, "stash", &["Save work"]).unwrap();
        assert!(snapshot(path).unwrap().files.is_empty());
        call(path, "stash-apply", &["stash@{0}"]).unwrap();
        assert_eq!(
            std::fs::read_to_string(folder.path().join("file.txt")).unwrap(),
            "saved work\n"
        );
        call(path, "stage-all", &[]).unwrap();
        call(path, "commit", &["Saved work"]).unwrap();
        call(path, "branch", &["conflicting"]).unwrap();
        commit_file(path, "file.txt", "branch change\n");
        call(path, "checkout", &["main"]).unwrap();
        commit_file(path, "file.txt", "main change\n");
        assert!(call(path, "merge", &["conflicting"]).is_err());
        let state = snapshot(path).unwrap();
        assert_eq!(state.operation, "merge");
        assert!(state.files.iter().any(|f| f.conflict));
        call(path, "abort", &["merge"]).unwrap();
        assert!(snapshot(path).unwrap().operation.is_empty());
    }
    #[test]
    fn remote_tracking_and_publishing_without_origin() {
        let remote = tempfile::tempdir().unwrap();
        git(remote.path().to_str().unwrap(), &["init", "--bare"]).unwrap();
        let folder = repository();
        let path = folder.path().to_str().unwrap();
        commit_file(path, "file.txt", "hello");
        call(
            path,
            "remote-add",
            &["team", remote.path().to_str().unwrap()],
        )
        .unwrap();
        call(path, "push", &[]).unwrap();
        let state = snapshot(path).unwrap();
        assert_eq!(state.upstream, "team/main");
        assert_eq!(state.ahead, 0);
        assert!(state
            .branches
            .iter()
            .any(|b| b.name == "team/main" && b.remote));
        git(path, &["push", "team", "HEAD:refs/heads/feature/shared"]).unwrap();
        call(path, "fetch", &[]).unwrap();
        call(path, "checkout", &["team/feature/shared"]).unwrap();
        assert_eq!(snapshot(path).unwrap().branch, "feature/shared");
        assert_eq!(snapshot(path).unwrap().upstream, "team/feature/shared");
    }
    #[test]
    fn pathspec_characters_and_unicode_are_literal() {
        let folder = repository();
        let path = folder.path().to_str().unwrap();
        std::fs::write(folder.path().join("file[1].txt"), "literal").unwrap();
        std::fs::write(folder.path().join("file1.txt"), "unrelated").unwrap();
        std::fs::write(folder.path().join("日本語.txt"), "unicode").unwrap();
        call(path, "stage", &["file[1].txt"]).unwrap();
        call(path, "stage", &["日本語.txt"]).unwrap();
        call(path, "commit", &["Literal paths"]).unwrap();
        let state = snapshot(path).unwrap();
        assert_eq!(state.files.len(), 1);
        assert_eq!(state.files[0].path, "file1.txt");
        let files = call(path, "commit-files", &[&state.commits[0].hash]).unwrap();
        assert!(files.split('\0').any(|p| p == "日本語.txt"));
        assert!(
            diff(path, "file[1].txt", Some(&state.commits[0].hash), false)
                .unwrap()
                .contains("+literal")
        );
    }
}

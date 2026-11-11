import type { FileStatus } from "./types";
export function optimisticIndex(
  files: FileStatus[],
  action: string,
  path?: string,
): FileStatus[] {
  return files
    .map((file) => {
      if (action !== "stage-all" && file.path !== path) return file;
      if (action === "unstage") {
        if (file.index === "A")
          return { ...file, index: "?", worktree: "?", conflict: false };
        return {
          ...file,
          index: " ",
          worktree: file.worktree === " " ? file.index : file.worktree,
        };
      }
      if (file.worktree === " ") return file;
      return {
        ...file,
        index: ["A", "R", "C"].includes(file.index)
          ? file.index
          : file.worktree === "?"
            ? "A"
            : file.worktree,
        worktree: " ",
        conflict: false,
      };
    })
    .filter((file) => file.index !== " " || file.worktree !== " ");
}

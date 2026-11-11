import { invoke, isTauri } from "@tauri-apps/api/core";
import { demoSnapshot, demoWorkspace } from "./demo";
import type { Snapshot, Workspace, WorkingState } from "./types";
export const desktop = isTauri();
export const api = {
  load: () =>
    desktop
      ? invoke<Workspace>("load_workspace")
      : Promise.resolve(demoWorkspace),
  save: (workspace: Workspace) =>
    desktop ? invoke("save_workspace", { workspace }) : Promise.resolve(),
  snapshot: (path: string) =>
    desktop
      ? invoke<Snapshot>("repository", { path })
      : Promise.resolve(demoSnapshot(path)),
  workingState: (path: string) =>
    desktop
      ? invoke<WorkingState>("working_state", { path })
      : Promise.resolve(demoSnapshot(path)),
  execute: (path: string, action: string, args: string[] = []) =>
    desktop
      ? invoke<string>("execute", { path, action, args })
      : Promise.reject(
          new Error(
            "This is the browser demo. Run the desktop app to use local Git operations.",
          ),
        ),
  diff: (
    path: string,
    file: string,
    revision: string | null,
    staged: boolean,
  ) =>
    desktop
      ? invoke<string>("diff", { path, file, revision, staged })
      : Promise.resolve(
          `diff --git a/${file} b/${file}\nindex f142ad1..c783ba2 100644\n--- a/${file}\n+++ b/${file}\n@@ -12,6 +12,9 @@\n export function RepositorySidebar() {\n   const { repositories } = useWorkspace();\n-  const [selected, setSelected] = useState(null);\n+  const [selected, setSelected] = useState<string | null>(null);\n+  const grouped = groupBy(repositories, 'workspace');\n+  const activeRepository = useActiveRepository();\n \n   return (\n-    <aside className="sidebar">\n+    <aside className="sidebar" aria-label="Repositories">\n       <RepositoryList repositories={repositories} />\n     </aside>\n   );\n }`,
        ),
};

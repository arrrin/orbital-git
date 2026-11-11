import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cargoBin = join(homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ""}`,
};
if (
  spawnSync("cargo", ["--version"], { env, windowsHide: true }).status !== 0
) {
  console.error(
    "Rust is required. Install the stable toolchain from https://rustup.rs, then run this command again.",
  );
  process.exit(1);
}
if (process.platform === "win32") {
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const linkerOnPath =
    spawnSync("where.exe", ["link.exe"], { env, windowsHide: true }).status ===
    0;
  const visualCpp =
    existsSync(vswhere) &&
    Boolean(
      spawnSync(
        vswhere,
        [
          "-products",
          "*",
          "-requires",
          "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
          "-property",
          "installationPath",
        ],
        { encoding: "utf8", windowsHide: true },
      ).stdout?.trim(),
    );
  if (!linkerOnPath && !visualCpp) {
    console.error(
      'Orbital requires Microsoft Visual C++ Build Tools. Install Visual Studio Build Tools with "Desktop development with C++" and a Windows SDK, then rerun this command.\nSetup: https://v2.tauri.app/start/prerequisites/#windows',
    );
    process.exit(1);
  }
}
const child = spawn(
  process.execPath,
  [
    join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"),
    ...process.argv.slice(2),
  ],
  { cwd: root, env, stdio: "inherit", windowsHide: true },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

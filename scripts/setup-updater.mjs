// One-time setup. Keys stay outside Git; only encrypted secrets are sent to GitHub.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  chmodSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sodium from "libsodium-wrappers";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const keyPath = join(homedir(), ".tauri", "orbital-git.key");
const repo = "arrrin/orbital-git";
async function main() {
  const configPath = join(root, "src-tauri/tauri.conf.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const configuredKey = config.plugins?.updater?.pubkey;
  if (configuredKey && (!existsSync(keyPath) || !existsSync(keyPath + ".pub")))
    throw new Error(
      "This app already has an updater key. Restore its original key pair from backup before running setup on this machine.",
    );
  const origin = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!/github\.com[/:]arrrin\/orbital-git(?:\.git)?$/.test(origin))
    throw new Error("This setup is scoped to arrrin/orbital-git.");
  if (!existsSync(keyPath) && !existsSync(keyPath + ".pub")) {
    mkdirSync(dirname(keyPath), { recursive: true });
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/@tauri-apps/cli/tauri.js"),
        "signer",
        "generate",
        "--ci",
        "--write-keys",
        keyPath,
        "--password",
        "",
      ],
      { cwd: root, stdio: "pipe", windowsHide: true },
    );
  }
  if (!existsSync(keyPath) || !existsSync(keyPath + ".pub"))
    throw new Error(
      "The updater key pair is incomplete. Restore its backup before continuing.",
    );
  if (
    configuredKey &&
    configuredKey !== readFileSync(keyPath + ".pub", "utf8").trim()
  )
    throw new Error(
      "Local updater key does not match the configured app key. Restore the original key pair.",
    );
  if (process.platform === "win32") {
    const account = execFileSync("whoami", [], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    execFileSync(
      "icacls",
      [keyPath, "/inheritance:r", "/grant:r", account + ":(F)"],
      { stdio: "pipe", windowsHide: true },
    );
  } else chmodSync(keyPath, 0o600);
  const credentials = execFileSync("git", ["credential", "fill"], {
    cwd: root,
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const token = credentials
    .split(/\r?\n/)
    .find((line) => line.startsWith("password="))
    ?.slice("password=".length);
  if (!token)
    throw new Error(
      "GitHub authentication is unavailable. Sign in to Git with repository administration access and retry.",
    );
  const api = async (path, options = {}) => {
    const response = await fetch(
      "https://api.github.com/repos/" + repo + path,
      {
        ...options,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
    );
    if (!response.ok)
      throw new Error(
        "GitHub updater setup failed with HTTP " +
          response.status +
          ". Repository secrets administration access is required.",
      );
    return response.status === 204 ? null : response.json();
  };
  const publicKey = await api("/actions/secrets/public-key");
  await sodium.ready;
  const encrypted = sodium.crypto_box_seal(
    sodium.from_string(readFileSync(keyPath, "utf8").trim()),
    sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL),
  );
  await api("/actions/secrets/TAURI_SIGNING_PRIVATE_KEY", {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(
        encrypted,
        sodium.base64_variants.ORIGINAL,
      ),
      key_id: publicKey.key_id,
    }),
  });
  config.plugins ??= {};
  config.plugins.updater = {
    ...config.plugins.updater,
    pubkey: readFileSync(keyPath + ".pub", "utf8").trim(),
    endpoints: [
      "https://github.com/" + repo + "/releases/latest/download/latest.json",
    ],
    windows: { installMode: "passive" },
  };
  config.bundle.createUpdaterArtifacts = true;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(
    "Updater configured. Signing key protected at " +
      keyPath +
      ". GitHub signing secret saved; private key was not printed.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const filenames = [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];
const manifestVersion = /^(version\s*=\s*")[^"]+("\s*)$/m;
const lockVersion =
  /(\[\[package\]\]\r?\nname = "orbital-git"\r?\nversion = ")[^"]+("(?:\r?\n|$))/;

export function versions(files) {
  const npm = JSON.parse(files["package.json"]);
  const lock = JSON.parse(files["package-lock.json"]);
  const tauri = JSON.parse(files["src-tauri/tauri.conf.json"]);
  const cargo = files["src-tauri/Cargo.toml"].match(
    /^version\s*=\s*"([^"]+)"/m,
  )?.[1];
  const cargoLock = files["src-tauri/Cargo.lock"].match(
    /\[\[package\]\]\r?\nname = "orbital-git"\r?\nversion = "([^"]+)"/,
  )?.[1];
  const result = [
    npm.version,
    lock.version,
    lock.packages?.[""]?.version,
    tauri.version,
    cargo,
    cargoLock,
  ];
  if (result.some((v) => typeof v !== "string"))
    throw new Error("Cannot find all application version fields.");
  return result;
}

export function updateVersions(files, version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error(
      "Use a stable version such as 0.1.1, without the v prefix.",
    );
  versions(files); // Validate every file before planning any writes.
  const next = { ...files };
  for (const name of [
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
  ]) {
    const value = JSON.parse(files[name]);
    value.version = version;
    if (name === "package-lock.json") value.packages[""].version = version;
    next[name] = JSON.stringify(value, null, 2) + "\n";
  }
  next["src-tauri/Cargo.toml"] = files["src-tauri/Cargo.toml"].replace(
    manifestVersion,
    (_match, before, after) => before + version + after,
  );
  next["src-tauri/Cargo.lock"] = files["src-tauri/Cargo.lock"].replace(
    lockVersion,
    (_match, before, after) => before + version + after,
  );
  if (versions(next).some((v) => v !== version))
    throw new Error(
      "Version update did not match every file. No files were written.",
    );
  return next;
}

function main() {
  const args = process.argv.slice(2);
  const files = Object.fromEntries(
    filenames.map((name) => [name, readFileSync(join(root, name), "utf8")]),
  );
  if (args[0] === "--check") {
    const values = versions(files);
    if (new Set(values).size !== 1)
      throw new Error(
        `Application versions do not match: ${values.join(", ")}`,
      );
    const tagIndex = args.indexOf("--tag");
    if (tagIndex >= 0 && args[tagIndex + 1] !== `v${values[0]}`)
      throw new Error(
        `Release tag must be v${values[0]}. Update the application version before tagging.`,
      );
    console.log(`Application versions match: ${values[0]}`);
    return;
  }
  if (args.length !== 1)
    throw new Error("Usage: npm run release:version -- 0.1.1");
  const next = updateVersions(files, args[0]);
  for (const name of filenames) writeFileSync(join(root, name), next[name]);
  console.log(
    `Updated application version to ${args[0]}. Review, commit, and tag v${args[0]}.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

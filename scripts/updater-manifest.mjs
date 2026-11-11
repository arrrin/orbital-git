import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const tag = "v" + version;
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== tag)
  throw new Error("Updater tag must match application version.");
const folder = join(root, "src-tauri/target/release/bundle/nsis");
const installers = readdirSync(folder).filter((name) => name.endsWith(".exe"));
if (installers.length !== 1)
  throw new Error("Expected exactly one Windows installer.");
const installer = installers[0];
const signature = readFileSync(join(folder, installer + ".sig"), "utf8").trim();
if (!signature) throw new Error("The updater signature is empty.");
const manifest = {
  version,
  notes: existsSync(join(root, "releases", tag + ".md"))
    ? readFileSync(join(root, "releases", tag + ".md"), "utf8")
    : "Orbital " + tag,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url:
        "https://github.com/arrrin/orbital-git/releases/download/" +
        tag +
        "/" +
        encodeURIComponent(installer),
    },
  },
};
writeFileSync(
  join(folder, "latest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Created signed Windows update manifest for " + tag);

import { describe, expect, it } from "vitest";
import { updateVersions, versions } from "./version.mjs";
const files = {
  "package.json": '{"version":"0.1.0"}',
  "package-lock.json":
    '{"version":"0.1.0","packages":{"":{"version":"0.1.0"},"node_modules/example":{"version":"0.1.0"}}}',
  "src-tauri/tauri.conf.json": '{"version":"0.1.0"}',
  "src-tauri/Cargo.toml":
    '[package]\nname = "orbital-git"\nversion = "0.1.0"\n\n[dependencies]\nexample = "0.1.0"\n',
  "src-tauri/Cargo.lock":
    'version = 4\n\n[[package]]\nname = "example"\nversion = "0.1.0"\n\n[[package]]\nname = "orbital-git"\nversion = "0.1.0"\n',
};
describe("release versions", () => {
  it("updates all application fields without changing dependency versions", () => {
    const next = updateVersions(files, "0.2.1");
    expect(new Set(versions(next))).toEqual(new Set(["0.2.1"]));
    expect(
      JSON.parse(next["package-lock.json"]).packages["node_modules/example"]
        .version,
    ).toBe("0.1.0");
    expect(next["src-tauri/Cargo.toml"]).toContain('example = "0.1.0"');
    expect(next["src-tauri/Cargo.lock"]).toContain(
      'name = "example"\nversion = "0.1.0"',
    );
    expect(versions(files)[0]).toBe("0.1.0");
  });
  it("rejects invalid versions and incomplete manifests before writing", () => {
    expect(() => updateVersions(files, "v0.2.1")).toThrow();
    expect(() => updateVersions(files, "01.2.1")).toThrow();
    expect(() =>
      updateVersions(
        { ...files, "src-tauri/Cargo.lock": "version = 4" },
        "0.2.1",
      ),
    ).toThrow();
  });
});

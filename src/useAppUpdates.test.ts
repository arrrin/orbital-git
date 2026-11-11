// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  check,
  type Update,
  type DownloadEvent,
} from "@tauri-apps/plugin-updater";
import { useAppUpdates } from "./useAppUpdates";
vi.mock("./api", () => ({ desktop: true }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
function update() {
  return {
    version: "0.2.2",
    close: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  };
}
describe("signed app updates", () => {
  it("discovers releases automatically but installs only after a user action", async () => {
    const found = update();
    vi.mocked(check).mockResolvedValue(found as unknown as Update);
    const { result } = renderHook(() => useAppUpdates(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.version).toBe("0.2.2");
    expect(found.downloadAndInstall).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.install();
    });
    expect(found.downloadAndInstall).toHaveBeenCalledTimes(1);
  });
  it("waits for Git operations, reports download progress, and prevents duplicate installations", async () => {
    const found = update();
    let finish!: () => void;
    let progress!: (event: DownloadEvent) => void;
    found.downloadAndInstall.mockImplementation((callback) => {
      progress = callback;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    vi.mocked(check).mockResolvedValue(found as unknown as Update);
    const { result, rerender } = renderHook(
      ({ allowed }) => useAppUpdates(allowed),
      { initialProps: { allowed: false } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await result.current.install();
    });
    expect(found.downloadAndInstall).not.toHaveBeenCalled();
    rerender({ allowed: true });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.install();
    });
    act(() => {
      progress({ event: "Started", data: { contentLength: 100 } });
      progress({ event: "Progress", data: { chunkLength: 25 } });
    });
    expect(result.current.progress).toBe(25);
    await act(async () => {
      await result.current.install();
    });
    expect(found.downloadAndInstall).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await pending;
    });
  });
  it("keeps a failed signature or installation visible and allows retry", async () => {
    const found = update();
    found.downloadAndInstall.mockRejectedValueOnce(
      new Error("Signature verification failed"),
    );
    vi.mocked(check).mockResolvedValue(found as unknown as Update);
    const { result } = renderHook(() => useAppUpdates(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.error).toContain("Signature verification failed");
    expect(result.current.isInstalling).toBe(false);
    await act(async () => {
      await result.current.install();
    });
    expect(found.downloadAndInstall).toHaveBeenCalledTimes(2);
  });
});

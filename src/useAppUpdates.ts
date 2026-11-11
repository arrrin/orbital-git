import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { desktop } from "./api";
import { invoke } from "@tauri-apps/api/core";
type Phase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "error";
export function useAppUpdates(canInstall: boolean) {
  const [state, setState] = useState<{
    phase: Phase;
    version: string;
    progress: number | null;
    error: string;
    checked: boolean;
  }>({ phase: "idle", version: "", progress: null, error: "", checked: false });
  const available = useRef<Update | null>(null),
    inFlight = useRef(false),
    installing = useRef(false),
    mounted = useRef(true);
  const checkNow = useCallback(async () => {
    if (!desktop || inFlight.current || installing.current) return;
    inFlight.current = true;
    setState((s) => ({
      ...s,
      phase: "checking",
      error: "",
    }));
    try {
      const update = await check({ timeout: 15000 });
      if (!mounted.current) {
        await update?.close();
        return;
      }
      await available.current?.close();
      available.current = update;
      setState({
        phase: update ? "available" : "idle",
        version: update?.version ?? "",
        progress: null,
        error: "",
        checked: true,
      });
    } catch (error) {
      if (mounted.current)
        setState((s) => ({
          ...s,
          phase: s.version ? "available" : "error",
          error: String(error),
          checked: true,
        }));
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!desktop) return;
    const startup = setTimeout(() => void checkNow(), 2000);
    const timer = setInterval(() => void checkNow(), 30 * 60000);
    return () => {
      mounted.current = false;
      clearTimeout(startup);
      clearInterval(timer);
      if (!installing.current) void available.current?.close().catch(() => {});
    };
  }, [checkNow]);
  const install = async () => {
    if (
      !available.current ||
      !canInstall ||
      inFlight.current ||
      installing.current
    )
      return;
    installing.current = true;
    setState((s) => ({
      ...s,
      phase: "downloading",
      progress: null,
      error: "",
    }));
    let received = 0,
      total = 0;
    try {
      await available.current.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          received = 0;
        }
        if (event.event === "Progress") received += event.data.chunkLength;
        if (mounted.current)
          setState((s) => ({
            ...s,
            phase: event.event === "Finished" ? "installing" : "downloading",
            progress: total
              ? Math.min(100, Math.round((received / total) * 100))
              : null,
          }));
      });
      if (mounted.current)
        setState((s) => ({ ...s, phase: "installed", progress: 100 }));
    } catch (error) {
      installing.current = false;
      if (mounted.current)
        setState((s) => ({
          ...s,
          phase: "available",
          error: String(error),
          progress: null,
        }));
    }
  };
  return {
    ...state,
    checkNow,
    install,
    restart: () => invoke("restart_app"),
    isInstalling: ["downloading", "installing", "installed"].includes(
      state.phase,
    ),
  };
}

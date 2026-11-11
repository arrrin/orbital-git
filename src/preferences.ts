export interface Preferences {
  fontFamily: string;
  fontSize: number;
  fetchMinutes: number;
  sidebarWidth: number;
  filesWidth: number;
  inspectorWidth: number;
  animations: boolean;
}
export const defaults: Preferences = {
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  fontSize: 12,
  fetchMinutes: 5,
  sidebarWidth: 242,
  filesWidth: 340,
  inspectorWidth: 255,
  animations: true,
};
export const preferenceKey = "orbital.preferences.v1";
export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
    const number = (key: keyof Preferences, min: number, max: number) =>
      typeof saved[key] === "number" && Number.isFinite(saved[key])
        ? Math.min(max, Math.max(min, saved[key]))
        : (defaults[key] as number);
    return {
      fontFamily:
        typeof saved.fontFamily === "string" && saved.fontFamily.trim()
          ? saved.fontFamily
          : defaults.fontFamily,
      fontSize: number("fontSize", 10, 18),
      fetchMinutes: [0, 1, 3, 5, 10, 15].includes(saved.fetchMinutes)
        ? saved.fetchMinutes
        : defaults.fetchMinutes,
      sidebarWidth: number("sidebarWidth", 170, 420),
      filesWidth: number("filesWidth", 220, 600),
      inspectorWidth: number("inspectorWidth", 200, 480),
      animations:
        typeof saved.animations === "boolean" ? saved.animations : true,
    };
  } catch {
    return { ...defaults };
  }
}

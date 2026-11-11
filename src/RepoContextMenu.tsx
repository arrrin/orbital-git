import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export interface MenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export default function RepoContextMenu({
  x,
  y,
  name,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  name: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const bounds = ref.current?.getBoundingClientRect();
    setPosition({
      x: Math.max(
        8,
        Math.min(x, window.innerWidth - (bounds?.width ?? 240) - 8),
      ),
      y: Math.max(
        8,
        Math.min(y, window.innerHeight - (bounds?.height ?? 330) - 8),
      ),
    });
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        onClose();
        if (e.key === "Escape") previousFocus.current?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="repo-context-menu"
      role="menu"
      aria-label={`Options for ${name}`}
      style={{ left: position.x, top: position.y }}
      onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (current + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
        ]?.focus();
      }}
    >
      <div className="menu-repo-name">{name}</div>
      {actions.map((action) => (
        <button
          type="button"
          role="menuitem"
          key={action.label}
          className={action.danger ? "danger-text" : ""}
          disabled={action.disabled}
          onClick={() => {
            onClose();
            action.onClick();
          }}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

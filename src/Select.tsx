import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string; disabled: boolean };
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? text(child.props.children)
        : String(child),
    )
    .join("");
}
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
      }>(child)
    )
      return [];
    return child.type === "option"
      ? [
          {
            value: String(child.props.value ?? text(child.props.children)),
            label: text(child.props.children),
            disabled: !!child.props.disabled,
          },
        ]
      : optionsFrom(child.props.children);
  });
}
export default function Select({
  children,
  value,
  onChange,
  required = false,
  disabled = false,
  autoFocus = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  value?: string | number;
  onChange: (event: { target: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  const options = optionsFrom(children);
  const current = String(value ?? "");
  const id = useId();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false),
    [label, setLabel] = useState(ariaLabel ?? "Select option"),
    [position, setPosition] = useState({
      left: 0,
      top: 0,
      width: 200,
      maxHeight: 280,
    });
  const typeahead = useRef({ text: "", time: 0 });
  const enabled = options.filter((o) => !o.disabled);
  const [highlight, setHighlight] = useState(current);
  useLayoutEffect(() => {
    if (ariaLabel) {
      setLabel(ariaLabel);
      return;
    }
    const parent = root.current?.closest("label");
    if (parent) {
      const clone = parent.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-select-root]").forEach((el) => el.remove());
      setLabel(clone.textContent?.trim() || "Select option");
    }
  }, [ariaLabel, children]);
  useEffect(() => {
    if (autoFocus) trigger.current?.focus();
  }, [autoFocus]);
  useLayoutEffect(() => {
    if (!opened) return;
    const rect = trigger.current!.getBoundingClientRect();
    const maxHeight = Math.min(280, window.innerHeight - 24);
    const estimated = Math.min(
      (popup.current?.scrollHeight || options.length * 40 + 12) + 2,
      maxHeight,
    );
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const useAbove = below < estimated && above > below;
    setPosition({
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - Math.max(180, rect.width) - 8),
      ),
      top: useAbove ? Math.max(8, rect.top - estimated - 5) : rect.bottom + 5,
      width: Math.min(Math.max(180, rect.width), window.innerWidth - 16),
      maxHeight: Math.max(1, Math.min(maxHeight, useAbove ? above : below)),
    });
    const option = popup.current?.querySelector<HTMLButtonElement>(
      "[data-highlight=true]",
    );
    option?.focus({ preventScroll: true });
    if (option && popup.current)
      popup.current.scrollTop = Math.max(
        0,
        option.offsetTop - popup.current.clientHeight + option.offsetHeight,
      );
  }, [opened]);
  useEffect(() => {
    if (!opened) return;
    const close = (event: Event) => {
      if (!(event.target instanceof Node)) {
        setOpened(false);
        return;
      }
      if (
        !root.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpened(false);
    };
    const resize = () => setOpened(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", resize);
    };
  }, [opened]);
  const open = () => {
    setHighlight(
      enabled.some((o) => o.value === current)
        ? current
        : (enabled[0]?.value ?? ""),
    );
    setOpened(true);
  };
  const focus = (next: string) => {
    setHighlight(next);
    const option = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [],
    ).find((button) => button.dataset.value === next);
    option?.focus({ preventScroll: true });
    if (option && popup.current) {
      if (option.offsetTop < popup.current.scrollTop)
        popup.current.scrollTop = option.offsetTop;
      else if (
        option.offsetTop + option.offsetHeight >
        popup.current.scrollTop + popup.current.clientHeight
      )
        popup.current.scrollTop =
          option.offsetTop + option.offsetHeight - popup.current.clientHeight;
    }
  };
  const choose = (next: string) => {
    onChange({ target: { value: next } });
    setOpened(false);
    trigger.current?.focus();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && opened) {
      event.preventDefault();
      event.stopPropagation();
      setOpened(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "Tab" && opened) {
      setOpened(false);
      trigger.current?.focus();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!opened) {
        open();
        return;
      }
      const index = enabled.findIndex((o) => o.value === highlight);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
              enabled.length;
      if (enabled[next]) focus(enabled[next].value);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && opened) {
      event.preventDefault();
      event.stopPropagation();
      if (enabled.some((o) => o.value === highlight)) choose(highlight);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== " "
    ) {
      event.preventDefault();
      const now = Date.now();
      typeahead.current = {
        text:
          (now - typeahead.current.time < 700 ? typeahead.current.text : "") +
          event.key.toLowerCase(),
        time: now,
      };
      const match = enabled.find((o) =>
        o.label.toLowerCase().startsWith(typeahead.current.text),
      );
      if (match) {
        if (!opened) {
          setHighlight(match.value);
          setOpened(true);
        } else focus(match.value);
      }
    }
  };
  return (
    <div ref={root} className="custom-select" data-select-root>
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={opened}
        aria-controls={opened ? id : undefined}
        aria-required={required}
        disabled={disabled}
        onClick={() => (opened ? setOpened(false) : open())}
        onKeyDown={keyboard}
      >
        <span>
          {options.find((o) => o.value === current)?.label ??
            "Choose an option…"}
        </span>
        <ChevronDown size={13} />
      </button>
      {required && (
        <input
          className="select-validator"
          aria-hidden="true"
          tabIndex={-1}
          value={current}
          required
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            open();
            trigger.current?.focus();
          }}
        />
      )}
      {opened &&
        createPortal(
          <div
            id={id}
            ref={popup}
            role="listbox"
            aria-label={label}
            className="select-popup"
            style={position}
            onKeyDown={keyboard}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                key={option.value}
                data-value={option.value}
                data-highlight={highlight === option.value}
                aria-selected={current === option.value}
                disabled={option.disabled}
                onPointerMove={() => setHighlight(option.value)}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {current === option.value && <Check size={13} />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="select-empty">No options available</div>
            )}
          </div>,
          document.querySelector(".app-shell") ?? document.body,
        )}
    </div>
  );
}

import { useRef } from "react";
export default function ResizeHandle({
  label,
  value,
  min,
  max,
  direction = 1,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  direction?: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const update = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  return (
    <div
      className={`resize-handle ${direction === -1 ? "from-left" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { x: event.clientX, value };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        document.body.classList.add("is-resizing");
      }}
      onPointerMove={(event) => {
        if (drag.current)
          update(
            drag.current.value + (event.clientX - drag.current.x) * direction,
          );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        document.body.classList.remove("is-resizing");
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        document.body.classList.remove("is-resizing");
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          update(
            value +
              (event.key === "ArrowRight" ? 1 : -1) *
                direction *
                (event.shiftKey ? 30 : 10),
          );
        }
        if (event.key === "Home") {
          event.preventDefault();
          onReset();
        }
      }}
      title="Drag to resize · Double-click to reset"
    />
  );
}

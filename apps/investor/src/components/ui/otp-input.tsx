import { useId, useRef, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { cn } from "~/lib/utils";

export interface OtpInputProps {
  /** The current code as a string of up to `length` digits. Controlled. */
  value: string;
  /** Called with the next code (digits only, capped at `length`). */
  onChange: (next: string) => void;
  /** Number of digit cells. Defaults to 6. */
  length?: number;
  /** Disables every cell (e.g. while verifying). */
  disabled?: boolean;
  /** Marks the group invalid for assistive tech + red styling. */
  invalid?: boolean;
  /** Fires when a full-length code is entered (typing or paste). */
  onComplete?: (code: string) => void;
  /** Accessible name for the whole group. */
  "aria-label"?: string;
  /** Id of the element describing the group (hint / error text). */
  "aria-describedby"?: string;
  /** Auto-focus the first empty cell on mount. */
  autoFocus?: boolean;
}

const DIGITS_ONLY = /\D/g;

/**
 * Accessible segmented one-time-code input. A single controlled `value` string
 * is the source of truth; each cell renders one character of it. Supports
 * type-to-advance, backspace-to-retreat, arrow navigation, and full-paste of a
 * code into any cell. The group is labelled and exposes `aria-invalid` so a
 * surrounding Field can wire error text to it.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  invalid = false,
  onComplete,
  autoFocus = false,
  "aria-label": ariaLabel = "One-time code",
  "aria-describedby": ariaDescribedby,
}: OtpInputProps) {
  const groupId = useId();
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.split("").slice(0, length);

  function focusCell(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    inputsRef.current[clamped]?.focus();
    inputsRef.current[clamped]?.select();
  }

  function commit(next: string) {
    const cleaned = next.replace(DIGITS_ONLY, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) {
      onComplete?.(cleaned);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>, index: number) {
    const raw = event.target.value.replace(DIGITS_ONLY, "");
    if (raw.length === 0) {
      return;
    }

    // Multi-char (autofill / SMS suggestion landing in one cell): fill forward.
    if (raw.length > 1) {
      const merged = value.slice(0, index) + raw.slice(0, length - index);
      commit(merged);
      focusCell(index + raw.length);
      return;
    }

    const chars = digits.slice();
    chars[index] = raw;
    commit(chars.join(""));
    if (index < length - 1) {
      focusCell(index + 1);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    switch (event.key) {
      case "Backspace": {
        event.preventDefault();
        const chars = digits.slice();
        if (chars[index]) {
          // Clear the current cell, stay put.
          chars[index] = "";
          commit(chars.join(""));
        } else if (index > 0) {
          // Already empty: clear the previous cell and retreat.
          chars[index - 1] = "";
          commit(chars.join(""));
          focusCell(index - 1);
        }
        break;
      }
      case "Delete": {
        event.preventDefault();
        const chars = digits.slice();
        chars[index] = "";
        commit(chars.join(""));
        break;
      }
      case "ArrowLeft":
        event.preventDefault();
        focusCell(index - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusCell(index + 1);
        break;
      case "Home":
        event.preventDefault();
        focusCell(0);
        break;
      case "End":
        event.preventDefault();
        focusCell(length - 1);
        break;
      default:
        break;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const pasted = event.clipboardData.getData("text").replace(DIGITS_ONLY, "");
    if (pasted.length === 0) {
      return;
    }
    event.preventDefault();
    const merged = value.slice(0, index) + pasted;
    commit(merged);
    const filledTo = Math.min(length - 1, index + pasted.length);
    focusCell(filledTo);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      {...(ariaDescribedby ? { "aria-describedby": ariaDescribedby } : {})}
      className="flex items-center justify-between gap-2 sm:gap-3"
    >
      {Array.from({ length }).map((_, index) => {
        const cellId = `${groupId}-${index}`;
        return (
          <input
            key={cellId}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            id={cellId}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            pattern="[0-9]*"
            maxLength={1}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-label={`Digit ${index + 1} of ${length}`}
            value={digits[index] ?? ""}
            autoFocus={autoFocus && index === 0}
            onChange={(event) => handleChange(event, index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => handlePaste(event, index)}
            onFocus={(event) => event.target.select()}
            className={cn(
              "h-12 w-full min-w-0 rounded-md border bg-white text-center text-lg font-semibold tabular-nums shadow-sm transition-colors",
              "focus:outline-none focus:ring-1",
              "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400",
              invalid
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-neutral-300 focus:border-brand-500 focus:ring-brand-500",
            )}
          />
        );
      })}
    </div>
  );
}

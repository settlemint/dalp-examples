import { Check, Loader2, Search, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "~/components/ui/input";
import type { ContactSuggestion } from "~/lib/dalp-types";
import { shortenAddress } from "~/lib/dalp-types";
import { cn } from "~/lib/utils";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface RecipientAutocompleteProps {
  /** The current recipient wallet address (controlled). */
  value: string;
  onChange: (wallet: string) => void;
  /**
   * Live contacts search (wired to `contacts.list`, filtered client-side by the
   * query in the route). Returns the matching contacts for the typed query.
   * Debounced by this component.
   */
  onSearch: (query: string) => Promise<ContactSuggestion[]>;
  disabled?: boolean;
  /** Field-level error (e.g. invalid address) surfaced under the input. */
  error?: string | null;
  id?: string;
}

/**
 * Recipient picker for the transfer form. Type a name or wallet — matching
 * contacts (from `contacts.list`, filtered by the query) appear in a
 * keyboard-navigable listbox; picking one fills the wallet. A raw 0x address can
 * be entered directly. Fully accessible: combobox semantics,
 * aria-activedescendant, arrow/enter/escape.
 */
export function RecipientAutocomplete({
  value,
  onChange,
  onSearch,
  disabled = false,
  error,
  id,
}: RecipientAutocompleteProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${generatedId}-listbox`;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Debounced live search. Each keystroke supersedes the previous in-flight
  // request via a monotonically increasing token, so stale results never win.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const token = ++requestId.current;
    const timer = window.setTimeout(() => {
      void onSearch(trimmed)
        .then((results) => {
          if (token === requestId.current) {
            setSuggestions(results);
            setActiveIndex(results.length > 0 ? 0 : -1);
          }
        })
        .catch(() => {
          if (token === requestId.current) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (token === requestId.current) {
            setLoading(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, onSearch]);

  // Close the listbox on outside click.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function select(suggestion: ContactSuggestion) {
    onChange(suggestion.wallet);
    setQuery(`${suggestion.name} · ${shortenAddress(suggestion.wallet)}`);
    setOpen(false);
    setSuggestions([]);
  }

  function handleInput(next: string) {
    setQuery(next);
    setOpen(true);
    // If the user types a raw address, treat it as the chosen recipient.
    onChange(ADDRESS_RE.test(next.trim()) ? next.trim() : "");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) {
        select(chosen);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const showList = open && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          {...(error ? { "aria-invalid": true } : {})}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search contacts or paste a 0x address"
          className="pl-9"
          value={query}
          disabled={disabled}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {loading ? (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-neutral-400"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Matching contacts"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {suggestions.length === 0 && loading ? (
            <li className="px-3 py-2 text-sm text-neutral-500" role="presentation">
              Searching…
            </li>
          ) : null}
          {suggestions.map((suggestion, index) => {
            const active = index === activeIndex;
            const selected = suggestion.wallet === value;
            return (
              <li
                key={suggestion.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                  active ? "bg-brand-50 text-brand-900" : "text-neutral-700 hover:bg-neutral-50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(suggestion);
                }}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                  <UserRound className="size-3.5 text-neutral-500" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-900">
                    {suggestion.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-neutral-500">
                    {shortenAddress(suggestion.wallet)}
                  </span>
                </span>
                {selected ? (
                  <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

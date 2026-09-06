import { useId, useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "../../i18n";

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  options: CustomSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  icon?: React.ReactNode;
  direction?: "auto" | "up" | "down";
}

export function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  className = "",
  icon,
  direction = "auto",
}: CustomSelectProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const placeholderText = placeholder ?? t.common.selectPlaceholder;

  const selectedOption = options.find((opt) => opt.value === value);
  const enabledIndexes = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const current = activeIndex >= 0 ? enabledIndexes.indexOf(activeIndex) : enabledIndexes.indexOf(selectedIndex);
    const next = current < 0
      ? (direction === 1 ? 0 : enabledIndexes.length - 1)
      : (current + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(enabledIndexes[event.key === "Home" ? 0 : enabledIndexes.length - 1] ?? -1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeIndex >= 0) selectIndex(activeIndex);
      else {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1));
        setOpen(true);
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    if (direction === "up") {
      setDropUp(true);
    } else if (direction === "down") {
      setDropUp(false);
    } else if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 180);
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open, direction]);

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrap ${disabled ? "is-disabled" : ""} ${open ? "is-open" : ""} ${className}`}
    >
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setOpen((prev) => {
          if (!prev) setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1));
          return !prev;
        })}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholderText}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        {icon && <span className="custom-select-icon">{icon}</span>}
        <span className="custom-select-label">
          {selectedOption ? selectedOption.label : placeholderText}
        </span>
        <ChevronDown size={14} className={`custom-select-arrow ${open ? "open" : ""}`} />
      </button>

      {open && !disabled && (
        <div
          className={`custom-select-dropdown ${dropUp ? "drop-up" : ""}`}
          id={listboxId}
          role="listbox"
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`custom-select-option ${isSelected ? "selected" : ""} ${opt.disabled ? "disabled" : ""}`}
                onClick={() => selectIndex(index)}
                disabled={opt.disabled}
                role="option"
                aria-selected={isSelected}
                tabIndex={index === activeIndex ? 0 : -1}
              >
                <span>{opt.label}</span>
                {isSelected && <Check size={14} className="custom-select-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { Children, forwardRef, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type OptionElement = ReactElement<{ value?: string | number; disabled?: boolean; children?: unknown }>;

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  searchable?: boolean;
  placeholder?: string;
}

function getOptionLabel(option: OptionElement | undefined): string {
  if (!option) return "";
  if (typeof option.props.children === "string") return option.props.children;
  if (typeof option.props.children === "number") return String(option.props.children);
  return "";
}

function getOptionValue(option: OptionElement | undefined): string {
  if (!option) return "";
  return String(option.props.value ?? "");
}

function dispatchNativeChange(selectElement: HTMLSelectElement, nextValue: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(selectElement, nextValue);
  selectElement.dispatchEvent(new Event("input", { bubbles: true }));
  selectElement.dispatchEvent(new Event("change", { bubbles: true }));
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      searchable = true,
      placeholder = "Selecione",
      disabled,
      value,
      defaultValue,
      onChange,
      onBlur,
      name,
      ...props
    },
    ref,
  ) => {
    const internalSelectRef = useRef<HTMLSelectElement | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [internalValue, setInternalValue] = useState<string>(String(defaultValue ?? ""));

    const setRefs = (node: HTMLSelectElement | null) => {
      internalSelectRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const optionElements = useMemo(
      () =>
        Children.toArray(children).filter((child): child is OptionElement => {
          return isValidElement(child) && child.type === "option";
        }),
      [children],
    );

    const isControlled = value !== undefined;
    const selectedValue = isControlled ? String(value ?? "") : internalValue;

    useEffect(() => {
      if (isControlled) return;
      const currentDomValue = internalSelectRef.current?.value ?? "";
      if (currentDomValue !== internalValue) {
        setInternalValue(currentDomValue);
      }
    }, [children, internalValue, isControlled]);

    const selectedOption = useMemo(
      () => optionElements.find((option) => getOptionValue(option) === selectedValue),
      [optionElements, selectedValue],
    );

    const filteredOptions = useMemo(() => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return optionElements;

      return optionElements.filter((option) => {
        const optionLabel = getOptionLabel(option).toLowerCase();
        const optionValue = getOptionValue(option).toLowerCase();
        return optionLabel.includes(term) || optionValue.includes(term);
      });
    }, [optionElements, searchTerm]);

    const closeDropdown = () => {
      setIsOpen(false);
      setSearchTerm("");
    };

    const handleNativeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      if (!isControlled) {
        setInternalValue(event.target.value);
      }
      onChange?.(event);
    };

    const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocused = event.relatedTarget as Node | null;
      if (event.currentTarget.contains(nextFocused)) return;
      closeDropdown();
      if (internalSelectRef.current) {
        internalSelectRef.current.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    };

    const handleOptionSelect = (nextValue: string) => {
      if (disabled) return;

      if (!isControlled) {
        setInternalValue(nextValue);
      }

      closeDropdown();

      if (internalSelectRef.current) {
        dispatchNativeChange(internalSelectRef.current, nextValue);
      }
    };

    if (!searchable) {
      return (
        <select
          ref={setRefs}
          value={selectedValue}
          defaultValue={defaultValue}
          onChange={handleNativeChange}
          onBlur={onBlur}
          disabled={disabled}
          name={name}
          className={cn(
            "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none ring-offset-2 transition focus:ring-2 focus:ring-ring",
            className,
          )}
          {...props}
        >
          {children}
        </select>
      );
    }

    const selectedLabel = getOptionLabel(selectedOption);
    const fallbackLabel = !selectedOption && selectedValue ? selectedValue : "";
    const inputValue = isOpen ? searchTerm : selectedLabel || fallbackLabel;

    return (
      <div className="relative" onBlur={handleContainerBlur}>
        <input
          type="text"
          value={inputValue}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearchTerm("");
          }}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm text-foreground outline-none ring-offset-2 transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-muted-foreground",
            className,
          )}
        />

        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            if (disabled) return;
            setIsOpen((prev) => !prev);
            if (!isOpen) setSearchTerm("");
          }}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
          aria-label="Abrir selecao"
        >
          <ChevronDown size={16} className={cn("transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && !disabled && (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optionValue = getOptionValue(option);
                const optionLabel = getOptionLabel(option);
                const optionDisabled = Boolean(option.props.disabled);
                const selected = optionValue === selectedValue;

                return (
                  <button
                    key={`${optionValue}-${optionLabel}`}
                    type="button"
                    disabled={optionDisabled}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (optionDisabled) return;
                      handleOptionSelect(optionValue);
                    }}
                    className={cn(
                      "block w-full rounded px-2 py-1 text-left text-sm",
                      optionDisabled && "cursor-not-allowed text-muted-foreground/50",
                      !optionDisabled && !selected && "text-foreground hover:bg-muted",
                      selected && "bg-primary/15 text-primary",
                    )}
                  >
                    {optionLabel || "(vazio)"}
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-1 text-sm text-muted-foreground">Nenhum resultado</p>
            )}
          </div>
        )}

        <select
          ref={setRefs}
          value={selectedValue}
          defaultValue={defaultValue}
          onChange={handleNativeChange}
          onBlur={onBlur}
          disabled={disabled}
          name={name}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          {...props}
        >
          {children}
        </select>
      </div>
    );
  },
);

Select.displayName = "Select";

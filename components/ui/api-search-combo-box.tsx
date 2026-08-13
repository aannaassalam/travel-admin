/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { cn } from "@/lib/utils";
import { QueryKey, useQuery, UseQueryOptions } from "@tanstack/react-query";
import { CommandLoading } from "cmdk";

type ComboboxOption = {
  label: string;
  value: string;
};

interface ApiSearchComboboxProps<T extends any[]> {
  value?: string;
  onChange: (value: string) => void;
  optionsGenerator: (data: T) => ComboboxOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  query: UseQueryOptions<T> & {
    queryKey: QueryKey;
    fetchFn: (...args: any) => Promise<T>;
  };
}

export function ApiSearchCombobox<T extends any[]>({
  value,
  onChange,
  optionsGenerator,
  placeholder = "Select...",
  className,
  disabled,
  query
}: ApiSearchComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const debouncedSearchValue = useDebounce(searchValue, 200);

  const { data, isFetching } = useQuery({
    queryKey: [...query.queryKey, debouncedSearchValue],
    queryFn: () => query.fetchFn(debouncedSearchValue)
  });

  const options = useMemo(
    () => optionsGenerator((data ?? []) as T),
    [data, optionsGenerator]
  );
  const selected = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {selected ? (
            <span className="bg-secondary py-0.5 px-2 rounded-lg">
              {" "}
              {selected.label}
            </span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder="Search..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandLoading className="p-4" hidden={!isFetching}>
            Loading...
          </CommandLoading>
          <CommandEmpty hidden={isFetching || options.length > 0}>
            No option found
          </CommandEmpty>
          <CommandList className="max-h-72" hidden={isFetching}>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    if (value === opt.value) {
                      onChange("");
                    } else {
                      onChange(opt.value);
                    }
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate" title={opt.label}>
                    {opt.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

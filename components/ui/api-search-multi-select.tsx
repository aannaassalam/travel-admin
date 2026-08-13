/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
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

type Option = {
  label: string;
  value: string;
};

interface ApiSearchMultiSelectProps<T extends any[]> {
  optionsGenerator: (data: T) => Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  query: UseQueryOptions<T> & {
    queryKey: QueryKey;
    fetchFn: (...args: any) => Promise<T>;
  };
}

export default function ApiSearchMultiSelect<T extends any[]>({
  optionsGenerator,
  value,
  onChange,
  placeholder = "Select...",
  disabled,
  query
}: ApiSearchMultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const debouncedSearchValue = useDebounce(searchValue, 200);

  const { data, isFetching } = useQuery({
    queryKey: [...query.queryKey, debouncedSearchValue],
    queryFn: () => query.fetchFn(debouncedSearchValue)
  });

  const toggleValue = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const options = React.useMemo(
    () => optionsGenerator((data || []) as T),
    [data, optionsGenerator]
  );

  const selectedLabels = options
    .filter((opt) => value.includes(opt.value))
    .map((opt) => opt.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between py-2.5 overflow-hidden"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {selectedLabels?.length ? (
            <div className="flex flex-nowrap gap-1 truncate">
              {selectedLabels.map((label) => (
                <Badge key={label} variant="secondary" className="shrink-0">
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput
            placeholder="Search..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandLoading className="p-4 text-center" hidden={!isFetching}>
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
                  onSelect={() => toggleValue(opt.value)}
                >
                  <div
                    className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      value?.includes(opt.value)
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50 [&_svg]:invisible"
                    )}
                  >
                    <Check className="size-4" />
                  </div>
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

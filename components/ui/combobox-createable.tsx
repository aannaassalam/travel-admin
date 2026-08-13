/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

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
import {
  QueryKey,
  useMutation,
  useQuery,
  UseQueryOptions
} from "@tanstack/react-query";
import { CommandLoading } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

type ComboboxOption = {
  label: string;
  value: string;
};

interface ComboboxCreatableProps<T extends any[]> {
  value?: string;
  onChange: (value: string) => void;
  optionsGenerator: (data: T) => ComboboxOption[];
  placeholder?: string;
  className?: string;
  returnFieldOfValue?: "label" | "value";
  disabled?: boolean;
  mutationFn: (...args: any) => Promise<unknown>;
  query: UseQueryOptions<T> & {
    queryKey: QueryKey;
    fetchFn: (...args: any) => Promise<T>;
  };
}

export function CreatableCombobox<T extends any[]>({
  value,
  onChange,
  optionsGenerator,
  placeholder = "Select...",
  className,
  disabled,
  mutationFn,
  returnFieldOfValue = "value",
  query
}: ComboboxCreatableProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [selectedOption, setSelectedOption] =
    React.useState<ComboboxOption | null>(null);

  const debouncedSearchValue = useDebounce(inputValue, 200);

  const { data, isFetching } = useQuery({
    queryKey: [...query.queryKey, debouncedSearchValue],
    queryFn: () => query.fetchFn(debouncedSearchValue)
  });

  const options = React.useMemo(
    () => optionsGenerator((data ?? []) as T),
    [data, optionsGenerator]
  );

  React.useEffect(() => {
    if (value && !selectedOption) {
      const match = options.find((opt) => opt[returnFieldOfValue] === value);
      if (match) {
        setSelectedOption(match);
      }
    }
  }, [options, value, selectedOption, returnFieldOfValue]);

  const { mutate, isPending } = useMutation({
    mutationFn: mutationFn,
    onSuccess: (data) => {
      onChange(inputValue);
      setSelectedOption({
        label: inputValue,
        value: (data as any)._id
      });
      setOpen(false);
      setInputValue("");
    },
    meta: {
      invalidateQueries: query.queryKey
    }
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("flex w-full min-w-[200px] justify-between", className)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {selectedOption ? (
            selectedOption?.label
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onInteractOutside={(e) => isPending && e.preventDefault()}
      >
        <Command
        // filter={(value, search) => {
        //   if (value.toLowerCase().includes(search.toLowerCase())) return 1;
        //   return 0;
        // }}
        >
          <CommandInput
            placeholder="Search or create..."
            value={inputValue}
            onValueChange={setInputValue}
            disabled={isPending}
          />
          <CommandLoading className="p-4" hidden={!isFetching}>
            Loading...
          </CommandLoading>
          <CommandEmpty hidden={isFetching} className="p-1">
            {inputValue !== "" ? (
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => mutate(inputValue)}
                disabled={isPending}
              >
                ➕ Create &quot;{inputValue}&quot;
              </Button>
            ) : (
              <span className="text-sm text-center text-gray-500 px-3">
                Type to search for record or create one
              </span>
            )}
          </CommandEmpty>
          <CommandList>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt[returnFieldOfValue]);
                    setSelectedOption(opt);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt[returnFieldOfValue]
                        ? "opacity-100"
                        : "opacity-0"
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

"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

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
import { cn } from "@/lib/utils";
import { CommandLoading } from "cmdk";
import React from "react";
import { ScrollArea } from "./scroll-area";

type ComboboxOption = {
  label: string | React.ReactNode;
  value: string;
  searchText?: string;
};

interface ComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  type?: string;
}

interface ReactElementWithChildren extends React.ReactElement {
  props: {
    children?: React.ReactNode;
  };
}

const getStringFromNode = (node: string | React.ReactNode): string => {
  if (typeof node === "string") {
    return node;
  }

  if (React.isValidElement(node)) {
    const extractText = (element: React.ReactNode): string => {
      if (typeof element === "string") {
        return element;
      }
      if (typeof element === "number") {
        return element.toString();
      }
      if (React.isValidElement(element)) {
        const elementWithChildren = element as ReactElementWithChildren;
        if (elementWithChildren.props?.children) {
          const children = React.Children.toArray(
            elementWithChildren.props.children
          );
          for (const child of children) {
            const text = extractText(child);
            if (text) return text;
          }
        }
      }
      if (Array.isArray(element)) {
        for (const item of element) {
          const text = extractText(item);
          if (text) return text;
        }
      }
      return "";
    };

    return extractText(node) || "Option";
  }

  return "Option";
};

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
  disabled,
  isLoading,
  type
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {selected ? (
            selected.label
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command
          filter={(itemValue, search) => {
            // Find the option that matches this item value
            const option = options.find((opt) => opt.value === itemValue);

            if (option) {
              const searchableText =
                option.searchText || getStringFromNode(option.label);
              if (searchableText.toLowerCase().includes(search.toLowerCase())) {
                return 1;
              }
            }
            return 0;
          }}
        >
          <CommandInput placeholder="Search..." />
          <ScrollArea
            className={cn(
              type === "service" ? "h-[200px]" : "h-auto max-h-[200px]"
            )}
          >
            <CommandList>
              <CommandEmpty>No option found</CommandEmpty>
              {isLoading && <CommandLoading>Loading...</CommandLoading>}
              <CommandGroup>
                {options.map((opt) => {
                  const titleText = getStringFromNode(opt.label);

                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === opt.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span
                        className="flex-1 truncate text-[13px]"
                        title={titleText}
                      >
                        {opt.label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

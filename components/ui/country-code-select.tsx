"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  getCountries,
  getCountryCallingCode
} from "react-phone-number-input/input";
import en from "react-phone-number-input/locale/en.json";

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

interface CountryCodeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CountryCodeSelect({
  value,
  onValueChange,
  placeholder = "Select country code...",
  className
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);

  const countries = useMemo(() => {
    return getCountries().map((country) => ({
      value: `+${getCountryCallingCode(country)}`,
      label: `${en[country]} (+${getCountryCallingCode(country)})`,
      country: country,
      code: `+${getCountryCallingCode(country)}`,
      name: en[country]
    }));
  }, []);

  const selectedCountry = countries.find((country) => country.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between border-blue-200 focus:border-blue-400 hover:bg-blue-50/50",
            className
          )}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2">
              <span className="text-lg">
                {String.fromCodePoint(
                  ...selectedCountry.country
                    .split("")
                    .map((char) => 0x1f1e6 + char.charCodeAt(0) - 65)
                )}
              </span>
              <span className="font-mono text-sm">{selectedCountry.code}</span>
              <span className="truncate text-sm text-gray-600">
                {selectedCountry.name}
              </span>
            </span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] border border-blue-200/50 bg-linear-to-br from-white via-blue-50 to-purple-50 p-0 shadow-xl">
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Search country..."
            className="border-none bg-transparent focus:ring-0"
          />
          <CommandList className="scrollbar-hide max-h-[200px] overflow-y-auto">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.value}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onValueChange(country.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer hover:bg-linear-to-r hover:from-blue-50 hover:to-purple-50"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-lg">
                      {String.fromCodePoint(
                        ...country.country
                          .split("")
                          .map((char) => 0x1f1e6 + char.charCodeAt(0) - 65)
                      )}
                    </span>
                    <span className="font-mono text-sm font-medium text-blue-600">
                      {country.code}
                    </span>
                    <span className="truncate text-sm text-gray-700">
                      {country.name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

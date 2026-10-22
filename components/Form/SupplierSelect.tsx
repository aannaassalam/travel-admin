import { listSuppliers } from "@/api/functions/admin.api";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

/**
 * A supplier, chosen from the list kept under Suppliers — never typed. The
 * team can then reach the hotel or agency from any booking, and one supplier
 * is not split across three spellings of its name.
 *
 * Switched-off suppliers are not offered, except the one already chosen.
 */
export default function SupplierSelect({
  value,
  onChange,
  label = "Supplier",
  required,
  disabled
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const { data, isError } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listSuppliers(),
    staleTime: 60 * 1000
  });
  const options = (data?.items ?? []).filter((s) => s.isActive || s.id === value);

  return (
    <div>
      <Label className="text-xs">
        {label}
        {required ? " *" : ""}
      </Label>
      <select
        disabled={disabled}
        aria-label={label}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{required ? "Choose…" : "None"}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.isActive ? "" : " (switched off)"}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isError ? "Could not load the suppliers. " : null}
        Not in the list?{" "}
        <Link href="/suppliers" className="underline underline-offset-2">
          Add it under Suppliers
        </Link>
        .
      </p>
    </div>
  );
}

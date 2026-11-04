import { listSuppliers } from "@/api/functions/admin.api";
import { OptionSelect } from "@/components/Form/OptionSelect";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/useT";
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
  label: labelProp,
  required,
  disabled
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const { t } = useT();
  const label = labelProp ?? t("inv.supplier");
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
      <OptionSelect
        disabled={disabled}
        aria-label={label}
        value={value}
        onChange={onChange}
        options={[
          {
            value: "",
            label: required ? t("inv.supplierSelect.choose") : t("inv.supplierSelect.none")
          },
          ...options.map((s) => ({
            value: s.id,
            label: (
              <>
                {s.name}
                {s.isActive ? "" : t("inv.supplierSelect.off")}
              </>
            )
          }))
        ]}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isError ? t("inv.supplierSelect.loadFailed") : null}
        {t("inv.supplierSelect.notListed")}{" "}
        <Link href="/suppliers" className="underline underline-offset-2">
          {t("inv.supplierSelect.addIt")}
        </Link>
        {t("inv.supplierSelect.end")}
      </p>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/useT";
import type { AxiosError } from "axios";

/**
 * The error state for a failed query — deliberately distinct from "empty", so a
 * load that errored does not read as "nothing here". A message and a retry.
 *
 * Given the `error`, a record the server says does not exist is said to be
 * gone — it may have been deleted since the link to it was made — and no retry
 * is offered for what cannot come back.
 */
export default function QueryError({
  onRetry,
  error,
  message
}: {
  onRetry?: () => void;
  error?: unknown;
  message?: string;
}) {
  const { t } = useT();
  if ((error as AxiosError | undefined)?.response?.status === 404) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("ops.queryError.gone")}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-destructive">{message ?? t("ops.queryError.message")}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={() => onRetry()}>
          {t("ops.queryError.retry")}
        </Button>
      ) : null}
    </div>
  );
}

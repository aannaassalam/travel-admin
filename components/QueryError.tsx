import { Button } from "@/components/ui/button";

/**
 * The error state for a failed query — deliberately distinct from "empty", so a
 * load that errored does not read as "nothing here". A message and a retry.
 */
export default function QueryError({
  onRetry,
  message = "Couldn't load this. Check your connection and try again."
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={() => onRetry()}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

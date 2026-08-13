import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";

/**
 * A mutation that shows its result immediately and puts it back if the server
 * disagrees.
 *
 * Every mutation in this panel used to wait for a round trip and then refetch
 * before anything moved on screen. On a Kinshasa connection that is a visible
 * pause on each click, and it makes the whole application feel like it is
 * thinking about whether to obey.
 *
 * The three-step shape is react-query's own, and each step matters:
 *
 *   onMutate    cancel in-flight refetches (or one lands after our patch and
 *               overwrites it), snapshot the cache, apply the change now
 *   onError     restore the snapshot — the server said no, so the screen must
 *               stop claiming otherwise
 *   onSettled   invalidate, so the truth arrives regardless of outcome
 *
 * Use this where the outcome is predictable from the input: toggling a flag,
 * moving a stage, editing a cell. Do NOT use it where the server decides
 * whether the action is legal at all — an order transition can be refused
 * because inventory moved, and flashing "confirmed" before the API rejects it
 * teaches operators to distrust the screen.
 */
export function useOptimisticMutation<TData, TVars, TSnapshot = unknown>({
  mutationFn,
  queryKey,
  apply,
  successMessage,
  errorMessage = "Could not save — put back",
  ...rest
}: {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** The cache entry to patch. */
  queryKey: QueryKey;
  /** Pure: given the current cache value and the variables, return the new one. */
  apply: (previous: TSnapshot | undefined, vars: TVars) => TSnapshot | undefined;
  successMessage?: string;
  errorMessage?: string;
} & Omit<
  UseMutationOptions<TData, unknown, TVars, { previous: TSnapshot | undefined }>,
  "mutationFn" | "onMutate" | "onError" | "onSettled" | "onSuccess"
>) {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVars, { previous: TSnapshot | undefined }>({
    mutationFn,
    // The panel's global handler toasts on every mutation; these speak for
    // themselves through the UI already moving.
    meta: { showToast: false },
    onMutate: async (vars) => {
      // Without this, a refetch already in flight can resolve after the patch
      // and silently revert it — the classic "my click didn't take" bug.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TSnapshot>(queryKey);
      queryClient.setQueryData<TSnapshot>(queryKey, (old) => apply(old, vars));
      return { previous };
    },
    onError: (error, _vars, context) => {
      // Put the screen back before saying anything, so the message and what is
      // on display agree.
      if (context) queryClient.setQueryData(queryKey, context.previous);
      toast.error(
        (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
          errorMessage
      );
    },
    onSuccess: () => {
      // Only here — `onSettled` also runs after a failure, which would toast
      // "saved" over the top of the error that just rolled the change back.
      if (successMessage) toast.success(successMessage);
    },
    onSettled: () => {
      // Success or failure, the server is the authority — go and ask it.
      queryClient.invalidateQueries({ queryKey });
    },
    ...rest
  });
}

/**
 * Where this is applied, and where it deliberately is not.
 *
 * Applied — the outcome is exactly the input:
 *   pages/enquiries.tsx       stage moves (worked as a list, several in a row)
 *   pages/customers/[id].tsx  block / unblock (a pure toggle)
 *
 * Not applied — the SERVER decides whether the action is even legal, so showing
 * the result first would be a lie the operator learns to distrust:
 *   pages/bookings/[id].tsx           transitions refused when inventory moved (409)
 *   components/Inventory/CalendarGrid price-change guard asks before applying (409)
 *   pages/inventory/index.tsx         duplicate / CSV import create ids only the
 *                                     server can mint
 *   pages/settings.tsx                step-up gated; a 403 opens a re-auth prompt
 *
 * The rule: optimistic where the client already knows the answer, honest
 * pending state where it does not.
 */

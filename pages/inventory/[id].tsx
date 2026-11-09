import AdminLayout from "@/components/Layout/AdminLayout";
import { useT } from "@/lib/i18n/useT";
import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * A hotel's room types used to have this page of their own. They are now the
 * Rooms tab of the hotel's page (2026-11-09); old links and bookmarks land there.
 */
export default function OldHotelRoomsPage() {
  const router = useRouter();
  const { t } = useT();
  const id = router.query.id;
  useEffect(() => {
    if (typeof id === "string") void router.replace(`/inventory/hotel/${id}?tab=rooms`);
  }, [id, router]);
  return (
    <AdminLayout title={t("inv.hotel")}>
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    </AdminLayout>
  );
}

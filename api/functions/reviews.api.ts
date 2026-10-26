import axiosInstance from "@/api/axiosInstance";
import type { PageParams, Paged } from "@/api/functions/admin.api";

/** Customer reviews, moderated here before the website shows them. */

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewTarget = "LISTING" | "HOTEL" | "RESTAURANT";

export interface AdminReview {
  id: string;
  targetType: ReviewTarget;
  target: string;
  /** Absent when the item has been deleted since. */
  targetLabel?: string;
  /** FLIGHT, BUS, CAR, ACTIVITY for a listing; HOTEL or RESTAURANT otherwise. */
  targetVertical?: string;
  targetSlug?: string;
  /** The customer's name as it is now; `authorName` is what the review is signed with. */
  customerName?: string;
  authorName: string;
  rating: number;
  comment?: string;
  locale?: string;
  status: ReviewStatus;
  /** They had a paid or completed booking of the item when they wrote it. */
  verified: boolean;
  moderatedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Sent back with approve/reject: a review the customer rewrote since is refused (409). */
  version: number;
}

export const listReviews = async (
  params: { status?: string; targetType?: string; q?: string } & PageParams = {}
) =>
  (
    await axiosInstance.get<Paged<AdminReview>>("/reviews", {
      // Blank filters left out, so the URL says only what was chosen.
      params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
    })
  ).data;

/** On the website from now on, and counted in the item's rating. */
export const approveReview = async (id: string, version: number) =>
  (await axiosInstance.post<{ review: AdminReview }>(`/reviews/${id}/approve`, { version })).data;

/** Kept but never shown; the customer sees it was not published. */
export const rejectReview = async (id: string, version: number) =>
  (await axiosInstance.post<{ review: AdminReview }>(`/reviews/${id}/reject`, { version })).data;

/** For good — content:delete and a recent password (DeleteButton handles both). */
export const deleteReview = async (id: string) => {
  await axiosInstance.delete(`/reviews/${id}`, { timeout: 30_000 });
};

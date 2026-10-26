import axiosInstance from "@/api/axiosInstance";
import type { StoredFile } from "@/api/functions/admin.api";

/** Partners: logos on the website's homepage and the app's Explore screen (Website content). */

export interface Partner {
  id: string;
  name: string;
  /** The address `uploadPartnerLogo` answered with. */
  logo: string;
  /** http(s), or blank. */
  website: string;
  /** Lowest first; ties by name. */
  sortOrder: number;
  /** Off: kept here, gone from the website and the app. */
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export type PartnerInput = Partial<
  Pick<Partner, "name" | "logo" | "website" | "sortOrder" | "isActive">
> & {
  /** The version the form loaded: a colleague's change in between is a 409, not overwritten. */
  version?: number;
};

export const listPartners = async () =>
  (await axiosInstance.get<{ items: Partner[] }>("/partners")).data;

export const createPartner = async (body: PartnerInput) =>
  (await axiosInstance.post<{ partner: Partner }>("/partners", body)).data;

export const updatePartner = async (id: string, body: PartnerInput) =>
  (await axiosInstance.patch<{ partner: Partner }>(`/partners/${id}`, body))
    .data;

/** For good; the server wants the password again if it was not given minutes ago. */
export const deletePartner = async (id: string) =>
  (await axiosInstance.delete(`/partners/${id}`)).data;

/**
 * The logo upload: content:write, unlike POST /uploads (inventory:write). The
 * server files it in the partners' public folder whatever is sent.
 */
export const uploadPartnerLogo = async (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return (
    await axiosInstance.post<{ files: StoredFile[] }>("/partners/logo", fd, {
      // Let the browser set the multipart boundary itself.
      headers: { "Content-Type": undefined }
    })
  ).data;
};

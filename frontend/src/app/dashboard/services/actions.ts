"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";

/**
 * A service, created or replaced whole.
 *
 * <p>Replaced and never patched: the API takes the whole offering, so a field
 * left out of an edit would be a field cleared rather than a field kept. The
 * form therefore carries every one of them, filled from what is stored.
 */
async function write(formData: FormData, path: string, method: string): Promise<void> {
  try {
    await api(path, {
      method,
      body: {
        name: String(formData.get("name")),
        description: String(formData.get("description") ?? "") || undefined,
        duration_minutes: Number(formData.get("duration_minutes")),
        buffer_before_minutes: Number(formData.get("buffer_before_minutes") ?? 0),
        buffer_after_minutes: Number(formData.get("buffer_after_minutes") ?? 0),
        price: {
          // The minor unit is the currency's own. The franc has no
          // subdivision, so what is typed is what is stored - and dividing by a
          // hundred here would be wrong in exactly the way "cents" is wrong
          // everywhere else in this product.
          amount_minor: Number(formData.get("amount_minor")),
          // Carried by the form, because the price belongs to the service and
          // nothing above it holds a currency. Defaulted from what the provider
          // already sells in rather than pinned to one market.
          currency: String(formData.get("currency")),
        },
        price_visible: formData.get("price_visible") === "on",
        sort_order: Number(formData.get("sort_order") ?? 0),
        active: formData.get("active") === "on",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/dashboard/services?error=${error.code ?? "UNKNOWN"}`);
    }
    throw error;
  }
  revalidatePath("/dashboard/services");
}

export async function createService(formData: FormData): Promise<void> {
  await write(formData, "/v1/service-offerings", "POST");
}

export async function replaceService(formData: FormData): Promise<void> {
  await write(
    formData,
    `/v1/service-offerings/${encodeURIComponent(String(formData.get("id")))}`,
    "PUT",
  );
}

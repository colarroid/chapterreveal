import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { BUILT_IN_TRANSLATIONS, fromRow, inAdminOrder, type OrderRow, type TranslationInfo, type TranslationRow } from "./translations";

/**
 * The translations churches can pick: built-in and published added ones, in
 * the order set on the admin site, without the ones it hides.
 */
export const getTranslations = cache(async (): Promise<TranslationInfo[]> => {
  const supabase = await supabaseServer();
  const [{ data }, { data: order }] = await Promise.all([
    supabase.from("translations").select("id, short, name, copyright, version").eq("published", true).order("short"),
    // Missing before migration 0017: then everything shows in the default order.
    supabase.from("translation_order").select("translation_id, position, hidden"),
  ]);
  const all = [...BUILT_IN_TRANSLATIONS, ...((data ?? []) as TranslationRow[]).map(fromRow)];
  return inAdminOrder(all, (order ?? []) as OrderRow[]).filter((t) => !t.hidden);
});

/** The translations this user starred, which go to the top of their picker. */
export async function getStarredTranslations(userId: string): Promise<string[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("translation_stars").select("translation_id").eq("user_id", userId).order("created_at");
  return (data ?? []).map((r) => r.translation_id as string);
}

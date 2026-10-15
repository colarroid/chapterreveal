import { preload } from "react-dom";
import { cleanDisplay } from "@/lib/display/theme";
import { findTranslation } from "@/lib/scripture/translations";
import { getStarredTranslations, getTranslations } from "@/lib/scripture/translations-server";
import { requireMembership } from "@/lib/supabase/server";
import { Console } from "./console";

export const metadata = { title: "Scriptures" };

export default async function DashboardPage() {
  const [m, translations] = await Promise.all([requireMembership(), getTranslations()]);
  const starred = await getStarredTranslations(m.userId);
  const translation = findTranslation(translations, m.settings.translation ?? "kjv");

  // Start downloading the Bible with the HTML, not after the console's
  // JavaScript has loaded and mounted. loadTranslation() picks it up from
  // the preload, so detection is ready the moment the page is.
  preload(translation.url, { as: "fetch", crossOrigin: "anonymous" });

  return (
    <Console
      churchId={m.churchId}
      userId={m.userId}
      screenToken={m.screenToken}
      translationId={translation.id}
      translations={translations}
      starred={starred}
      silenceEndMinutes={m.settings.silence_end_minutes ?? 20}
      display={cleanDisplay(m.settings.display)}
      canEditDisplay={m.role === "admin"}
    />
  );
}

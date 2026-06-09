import "server-only";
import { cookies, headers } from "next/headers";
import {
  createTranslator,
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  type Locale,
  type Translator,
} from "./messages";

/**
 * Resolve the active locale for a server render: an explicit, persisted choice
 * (cookie) wins; otherwise fall back to the browser's `Accept-Language`. Used by
 * server components and the root layout so the very first paint is already in the
 * user's language — no client-side flash.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const h = await headers();
  return localeFromAcceptLanguage(h.get("accept-language"));
}

/** Server-side translator bound to the resolved locale. */
export async function getT(): Promise<Translator> {
  return createTranslator(await getLocale());
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { getGoogleConfig } from "@/server/google-oauth";
import { getTurnstileConfig } from "@/server/turnstile";
import { LoginForm } from "./login-form";

export const metadata = { title: "Login" };

const loginErrors = new Map([
  ["unavailable", "Login Google sedang tidak tersedia."],
  ["expired", "Permintaan login sudah berakhir. Silakan mulai lagi."],
  ["cancelled", "Login Google dibatalkan."],
  ["invalid", "Login Google belum berhasil. Silakan coba lagi."],
]);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const { error } = await searchParams;
  const turnstileSiteKey = getGoogleConfig() ? getTurnstileConfig()?.siteKey : undefined;
  return <LoginForm turnstileSiteKey={turnstileSiteKey} initialError={typeof error === "string" ? loginErrors.get(error) : undefined} />;
}

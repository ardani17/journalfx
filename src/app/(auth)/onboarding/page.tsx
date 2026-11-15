import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { countUsers } from "@/server/services/users";
import { OnboardForm } from "./onboard-form";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const hasUser = (await countUsers()) > 0;
  if (hasUser) redirect("/login");
  return <OnboardForm />;
}

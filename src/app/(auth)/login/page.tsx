import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { countUsers } from "@/server/services/users";
import { LoginForm } from "./login-form";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const hasUser = (await countUsers()) > 0;
  if (!hasUser) redirect("/onboarding");
  return <LoginForm />;
}

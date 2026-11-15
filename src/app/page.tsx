import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}

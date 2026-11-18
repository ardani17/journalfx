import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function PublicInfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Link href="/" className="text-sm font-semibold text-primary hover:underline">{APP_NAME}</Link>
      <article className="mt-5 space-y-4 rounded-[14px] border border-line bg-panel p-5 text-sm leading-relaxed text-muted sm:p-7">
        {children}
      </article>
    </main>
  );
}

import Link from "next/link";
import { Construction, TrendingUp } from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

/** Honest placeholder for pages that ship in a later sequential release. */
export function ComingSoon({
  title,
  subtitle,
  release,
  features,
}: {
  title: string;
  subtitle: string;
  release: string;
  features: string[];
}) {
  return (
    <PageShell>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="panel-gradient">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo/40">
            <Construction className="h-7 w-7 text-indigo-soft" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">
              Hadir di rilis <span className="text-primary">{release}</span>
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              Fitur ini dikunci oleh kebijakan rilis sekuensial MDTP. Fondasi dan jurnal trading
              dibangun lebih dulu agar data finansial selalu berasal dari ledger yang auditable.
            </p>
          </div>
          <ul className="mt-2 grid w-full max-w-md gap-1.5 text-left">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2 text-xs text-muted">
                <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className="mt-2 text-xs font-medium text-primary hover:underline">
            ← Kembali ke Dashboard
          </Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}

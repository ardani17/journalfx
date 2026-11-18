import { JISDOR_PAGE_URL, type JisdorQuote } from "@/lib/finance/exchange";

const rateFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

export function JisdorRateNote({ quote }: { quote: JisdorQuote | null }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      <a href={JISDOR_PAGE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        JISDOR Bank Indonesia
      </a>
      {quote ? (
        <>
          {` · 1 USD = Rp${rateFormat.format(quote.rate as `${number}`)} · `}
          <time dateTime={quote.at}>{dateFormat.format(new Date(quote.at))}</time>
          {quote.status === "cached" ? <span className="text-warn"> · Kurs tersimpan</span> : null}
        </>
      ) : " · Kurs belum tersedia"}
    </p>
  );
}

import { ReviewPage, type ReviewSearchParams } from "../review-page";

export const metadata = { title: "Review Bulanan" };

export default function Page({ searchParams }: { searchParams: ReviewSearchParams }) {
  return <ReviewPage kind="MONTHLY" searchParams={searchParams} />;
}

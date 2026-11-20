import { ReviewPage, type ReviewSearchParams } from "../review-page";

export const metadata = { title: "Review Harian" };

export default function Page({ searchParams }: { searchParams: ReviewSearchParams }) {
  return <ReviewPage kind="DAILY" searchParams={searchParams} />;
}

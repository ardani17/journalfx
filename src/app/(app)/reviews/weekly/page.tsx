import { ReviewPage, type ReviewSearchParams } from "../review-page";

export const metadata = { title: "Review Mingguan" };

export default function Page({ searchParams }: { searchParams: ReviewSearchParams }) {
  return <ReviewPage kind="WEEKLY" searchParams={searchParams} />;
}

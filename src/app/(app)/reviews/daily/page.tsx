import { ReviewPage } from "../review-page";

export const metadata = { title: "Review Harian" };

export default function Page() {
  return <ReviewPage kind="DAILY" />;
}

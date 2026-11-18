import Image from "next/image";
import horizonLogo from "@/assets/horizon-logo-white.png";
import horizonMark from "@/assets/horizon-mark-white.png";

export function BrandLogo({ mark = false }: { mark?: boolean }) {
  return (
    <Image
      src={mark ? horizonMark : horizonLogo}
      alt=""
      sizes={mark ? "36px" : "112px"}
      className={mark ? "h-auto w-9 shrink-0" : "h-auto w-28 shrink-0"}
    />
  );
}

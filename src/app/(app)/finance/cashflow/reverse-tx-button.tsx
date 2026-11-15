"use client";

import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReverseTxButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Batalkan transaksi"
      onClick={async () => {
        await fetch(`/api/finance/transactions/${id}/reverse`, { method: "POST" });
        router.refresh();
      }}
    >
      <Undo2 className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}

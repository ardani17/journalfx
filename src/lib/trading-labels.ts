import type { AttachmentKind, ExecutionKind, TradeDirection, TradeStatus, WithdrawalStatus } from "@prisma/client";

export const tradeDirectionLabel = { LONG: "Beli", SHORT: "Jual" } satisfies Record<TradeDirection, string>;

export const tradeStatusLabel = {
  PLANNED: "Direncanakan",
  OPEN: "Terbuka",
  PARTIAL: "Ditutup sebagian",
  CLOSED: "Ditutup",
  CANCELLED: "Dibatalkan",
} satisfies Record<TradeStatus, string>;

export const executionKindLabel = {
  ENTRY: "Pembukaan posisi",
  PARTIAL_ENTRY: "Pembukaan sebagian",
  CLOSE: "Penutupan posisi",
  PARTIAL_CLOSE: "Penutupan sebagian",
} satisfies Record<ExecutionKind, string>;

export const attachmentKindLabel = {
  BEFORE: "Sebelum transaksi",
  ENTRY: "Saat pembukaan",
  DURING: "Selama transaksi",
  EXIT: "Saat penutupan",
} satisfies Record<AttachmentKind, string>;

export const withdrawalStatusLabel = {
  REQUESTED: "Diajukan",
  RECOMMENDED: "Direkomendasikan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
} satisfies Record<WithdrawalStatus, string>;

export const tradingSessionLabel: Readonly<Record<string, string>> = {
  asian: "Asia",
  london: "London",
  newyork: "New York",
};

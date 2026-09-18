export type PayoutAsset = "USDT" | "BTC" | "XMR";
export type UsdtNetwork = "TRC20" | "ERC20";

export type AwardStatus =
  | "draft"
  | "scheduled"
  | "armed"
  | "rolled"
  | "published"
  | "paid";

export interface PrizeLine {
  amountUsd: number;
  quantity: number;
}

export interface DeviceSnapshot {
  deviceId: string;
  entries: number;
  preferredAsset?: PayoutAsset | null;
  usdtAddress?: string | null;
  btcAddress?: string | null;
  xmrAddress?: string | null;
  referredBy?: string | null;
}

export interface DrawWinner {
  seat: number;
  prizeAmountUsd: number;
  deviceId: string;
  entries: number;
  preferredAsset: PayoutAsset | null;
  payoutAddress: string | null;
  referredBy: string | null;
}

export interface PublicStats {
  totalPrizesPaidUsd: number;
  periodEntries: number;
  activeDevices: number;
  nextAward: {
    headline: string | null;
    nextAwardAt: string | null;
    prizeSummary: string | null;
    totalUsd: number | null;
  } | null;
  totalDevices: number;
}

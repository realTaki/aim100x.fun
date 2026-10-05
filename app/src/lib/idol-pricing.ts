import type { Idol } from "@/lib/idols";

/** Default fan subscribe + single-image unlock (display USDC). */
export const DEFAULT_IDOL_PRICE_USDC = 1;

const USDC_DECIMALS = 6;
export const DEFAULT_PRICE_USDC_ATOMIC = 1_000_000n;

function parsePositiveUsdc(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function idolSubscribePriceUsdc(idol: Idol): number {
  return idol.subscribePriceUsdc > 0 ? idol.subscribePriceUsdc : DEFAULT_IDOL_PRICE_USDC;
}

export function idolImageUnlockPriceUsdc(idol: Idol): number {
  return idol.imageUnlockPriceUsdc > 0 ? idol.imageUnlockPriceUsdc : DEFAULT_IDOL_PRICE_USDC;
}

export function usdcToAtomic(usdc: number): bigint {
  const atomic = Math.round(usdc * 10 ** USDC_DECIMALS);
  return BigInt(Math.max(atomic, 1));
}

export function usdcToAtomicOrZero(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc <= 0) return 0n;
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS));
}

export function usdcToAtomicString(usdc: number): string {
  return String(usdcToAtomic(usdc));
}

export function atomicToUsdc(atomic: bigint | number | string): number {
  const n = typeof atomic === "bigint" ? Number(atomic) : Number(atomic);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDOL_PRICE_USDC;
  return n / 10 ** USDC_DECIMALS;
}

/** Atomic USDC → display units, including zero (累计收账). */
export function atomicAmountToUsdc(atomic: bigint | number | string): number {
  const n = typeof atomic === "bigint" ? Number(atomic) : Number(atomic);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n / 10 ** USDC_DECIMALS;
}

export function parseUsdcInput(raw: string): number | undefined {
  return parsePositiveUsdc(raw.trim());
}

/** Amount field that may be 0 (sale price). Empty → 0. */
export function parseUsdcAmountField(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  if (typeof Number(trimmed) === "number" && Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0) {
    return Number(trimmed);
  }
  return undefined;
}

export function formatUsdcPrice(usdc: number): string {
  const rounded = Math.round(usdc * 100) / 100;
  return rounded === Math.floor(rounded)
    ? `${rounded} LUSD`
    : `${rounded.toFixed(2)} LUSD`;
}

/** 0 means not listed. */
export function formatSalePrice(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) return "不出售";
  return formatUsdcPrice(usdc);
}

export function salePriceDraft(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) return "";
  return String(usdc);
}

export function formatReceiptsAmount(usdc: number): string {
  const rounded = Math.round(usdc * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

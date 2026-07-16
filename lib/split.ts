import type { SplitBeneficiary } from "@/lib/eupago";

// Divide o valor entre a liga e a plataforma (FirstRow) via externKeys do
// backoffice Eupago. A comissão (%) sai do lado da FirstRow.
export function buildSplit(amountEur: number): SplitBeneficiary[] {
  const leagueKey = process.env.EUPAGO_LEAGUE_EXTERNKEY ?? "";
  const platformKey = process.env.EUPAGO_PLATFORM_EXTERNKEY ?? "";
  const commissionPct = Number(process.env.PLATFORM_COMMISSION_PCT ?? "10");

  const platformShare = Math.round(amountEur * commissionPct) / 100;
  const leagueShare = Math.round((amountEur - platformShare) * 100) / 100;

  return [
    { externKey: leagueKey, amount: leagueShare },
    { externKey: platformKey, amount: platformShare },
  ];
}

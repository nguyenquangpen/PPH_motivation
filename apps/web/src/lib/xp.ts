import type { ExpectedXp, Settings } from '@pph/shared';

/** Same as server: round half up for non-negative values. */
export const roundHalfUp = (n: number): number => Math.floor(n + 0.5 + 1e-9);

/** F-07: NominalXP = round_half_up(C × Multiplier × clamp(D/Ref, Min, Max)); D = min(est, actual) when actual given. */
export function nominalXp(contribution: number, estimated: number, actual: number | null | undefined, s: Settings): number {
  const d = actual != null ? Math.min(estimated, actual) : estimated;
  const factor = Math.min(Math.max(d / s.refDuration, s.minFactor), s.maxFactor);
  return roundHalfUp(contribution * s.multiplier * factor);
}

export function expectedXp(contribution: number, estimated: number, actual: number | null | undefined, s: Settings): ExpectedXp {
  const nominal = nominalXp(contribution, estimated, actual, s);
  const isSmall = contribution < s.smallThreshold;
  return { isSmall, nominalXp: nominal, immediateXp: isSmall ? 0 : nominal, poolContribution: isSmall ? contribution : 0 };
}

/** Display text: 'N XP' for large tasks, '0 XP + N vào Pool' for small tasks. */
export function expectedXpLabel(e: ExpectedXp): string {
  return e.isSmall ? `0 XP + ${e.poolContribution} vào Pool` : `${e.immediateXp} XP`;
}

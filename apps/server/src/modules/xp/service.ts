import type { ExpectedXp, Settings } from '@pph/shared';
import type { AppContext } from '../../core/context.js';

/** round half up cho số dương (XP luôn ≥ 0) */
export const roundHalfUp = (n: number): number => Math.floor(n + 0.5 + 1e-9);

/**
 * F-07 công thức XP và phân loại Task lớn/nhỏ (CORE). Hàm thuần, không ghi DB.
 */
export class XpService {
  constructor(private ctx: AppContext) {}

  /** NominalXP = round_half_up(C × Multiplier × clamp(D/Ref, Min, Max)); D = min(est, actual) nếu có actual */
  nominalXp(contribution: number, estimated: number, actual: number | null | undefined, s: Settings = this.ctx.services.settings.get()): number {
    const d = actual != null ? Math.min(estimated, actual) : estimated;
    const factor = Math.min(Math.max(d / s.refDuration, s.minFactor), s.maxFactor);
    return roundHalfUp(contribution * s.multiplier * factor);
  }

  isSmall(contribution: number, s: Settings = this.ctx.services.settings.get()): boolean {
    return contribution < s.smallThreshold;
  }

  expected(contribution: number, estimated: number, actual: number | null | undefined): ExpectedXp {
    const s = this.ctx.services.settings.get();
    const small = this.isSmall(contribution, s);
    const nominal = this.nominalXp(contribution, estimated, actual, s);
    return { isSmall: small, nominalXp: nominal, immediateXp: small ? 0 : nominal, poolContribution: small ? contribution : 0 };
  }
}

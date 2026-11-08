/** Nguồn thời gian duy nhất cho code nghiệp vụ. Không gọi Date.now() trực tiếp. */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Đồng hồ cố định cho test; có thể set/advance. */
export class FixedClock implements Clock {
  private current: Date;
  constructor(iso: string | Date) {
    this.current = new Date(iso);
  }
  now(): Date {
    return new Date(this.current.getTime());
  }
  set(iso: string | Date): void {
    this.current = new Date(iso);
  }
  advanceMinutes(min: number): void {
    this.current = new Date(this.current.getTime() + min * 60_000);
  }
  advanceHours(h: number): void {
    this.advanceMinutes(h * 60);
  }
  advanceDays(d: number): void {
    this.advanceMinutes(d * 24 * 60);
  }
}

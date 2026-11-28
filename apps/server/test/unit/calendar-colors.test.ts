import { describe, expect, it } from 'vitest';
import { googleColorId } from '../../src/modules/calendar/colors.js';
import { addSession, connectedApp, local, push } from '../bdd/calendar-setup.js';

describe('Màu Event Google theo chủ đề (Goal)', () => {
  it('hex/tên màu của Goal → màu Google gần nhất', () => {
    expect(googleColorId('#dc2127', 'g1')).toBe('11');
    expect(googleColorId('green', 'g1')).toBe('10');
    expect(googleColorId('#5080f0', 'g1')).toBe('9');
  });

  it('Task không có Goal → xám; Goal chưa đặt màu → màu cố định, ổn định giữa các lần', () => {
    expect(googleColorId(null, null)).toBe('8');
    const a = googleColorId(null, 'goal-a');
    expect(a).toBe(googleColorId(null, 'goal-a'));
    expect(a).toMatch(/^(11|9|10|6|3|5|7|4)$/);
  });

  it('Push: Event mang màu và icon của Goal; đổi màu Goal → Event cập nhật sau khi sửa phiên', async () => {
    const t = await connectedApp();
    const goalId = t.f.goal({ title: 'Tiếng Nhật' });
    expect((await t.api.patch(`/api/v1/goals/${goalId}`, { color: '#dc2127', icon: '🇯🇵' })).status).toBe(200);
    const task = t.f.task({ title: 'Ôn bài', goalId }).id;
    await addSession(t, task, local('2026-11-10T19:00'), local('2026-11-10T20:00'));
    t.clock.advanceMinutes(0.5);
    await push(t);
    const e = t.fake.hubEvents()[0]!;
    expect(e.colorId).toBe('11');
    expect(e.title).toBe('🇯🇵 Ôn bài');
  });
});

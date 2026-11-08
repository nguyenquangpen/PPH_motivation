import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS, type SuggestionsDto } from '@pph/shared';
import { SuggestionsDialog } from '../src/components/TaskSessions';
import { WorkingHoursEditor } from '../src/components/SettingsRelease2';
import { KeyCreatedDialog } from '../src/pages/Integrations';
import { mockFetch, renderWithProviders, settingsHandler } from './helpers';

const sugg: SuggestionsDto = {
  taskId: 't-1', remainingMinutes: 90, windowEnd: '2026-11-10T10:00:00.000Z', calendarDataAvailable: true,
  message: 'Không đủ thời gian trống trước Deadline: thiếu 10 phút',
  options: [
    { index: 0, kind: 'CONTIGUOUS', totalMinutes: 80, complete: false, sessions: [{ start: '2026-11-09T01:00:00.000Z', end: '2026-11-09T02:20:00.000Z' }] },
    { index: 1, kind: 'SPLIT', totalMinutes: 80, complete: false, sessions: [
      { start: '2026-11-09T03:00:00.000Z', end: '2026-11-09T03:40:00.000Z' }, { start: '2026-11-09T05:00:00.000Z', end: '2026-11-09T05:40:00.000Z' }] },
  ],
};

describe('Release 2 UI', () => {
  it('suggestions dialog renders options and applies the chosen one with an Idempotency-Key', async () => {
    const calls = mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url === '/api/v1/tasks/t-1/suggestions' ? { body: sugg } : undefined),
      (c) => (c.method === 'POST' && c.url === '/api/v1/tasks/t-1/suggestions/apply' ? { body: { ok: true } } : undefined),
    );
    renderWithProviders(<SuggestionsDialog taskId="t-1" onClose={() => {}} />);
    expect(await screen.findAllByTestId('suggestion-option')).toHaveLength(2);
    expect(screen.getByText(/thiếu 10 phút/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Chọn' })[1]!);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/suggestions/apply'))).toBe(true));
    const post = calls.find((c) => c.url.endsWith('/suggestions/apply'))!;
    expect(post.body).toEqual({ sessions: sugg.options[1]!.sessions });
    expect(post.headers['Idempotency-Key']).toBeTruthy();
  });

  it('suggestions dialog shows reload message on 409', async () => {
    mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url === '/api/v1/tasks/t-1/suggestions' ? { body: sugg } : undefined),
      (c) => (c.method === 'POST' ? { status: 409, body: { error: { code: 'CONFLICT', message: 'Conflict' } } } : undefined),
    );
    renderWithProviders(<SuggestionsDialog taskId="t-1" onClose={() => {}} />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chọn' }))[0]!);
    expect(await screen.findByText(/Lịch đã thay đổi, tải lại gợi ý/)).toBeInTheDocument();
  });

  it('key created dialog shows the full key with the one-time warning', async () => {
    renderWithProviders(<KeyCreatedDialog keyValue="pph_live_abcdef123456" onClose={() => {}} />);
    expect(screen.getByTestId('created-key')).toHaveTextContent('pph_live_abcdef123456');
    expect(screen.getByText(/Key chỉ hiển thị một lần/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sao chép' })).toBeInTheDocument();
  });

  it('working hours editor sends the edited payload', async () => {
    const calls = mockFetch(settingsHandler, (c) => (c.method === 'PUT' ? { body: c.body } : undefined));
    renderWithProviders(<WorkingHoursEditor initial={DEFAULT_SETTINGS.workingHours} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xóa khung Chủ nhật 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm khung Thứ 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu giờ làm việc' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/v1/scheduling/working-hours');
    expect(put.body).toEqual({
      ...DEFAULT_SETTINGS.workingHours,
      mon: [{ start: '08:00', end: '22:00' }, { start: '08:00', end: '12:00' }],
      sun: [],
    });
  });

  it('working hours editor shows the server validation message', async () => {
    mockFetch(settingsHandler, (c) => (c.method === 'PUT' ? { status: 400, body: { error: { code: 'VALIDATION', message: 'Khung giờ chồng nhau (Thứ 2)' } } } : undefined));
    renderWithProviders(<WorkingHoursEditor initial={DEFAULT_SETTINGS.workingHours} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu giờ làm việc' }));
    expect(await screen.findByText('Khung giờ chồng nhau (Thứ 2)')).toBeInTheDocument();
  });
});

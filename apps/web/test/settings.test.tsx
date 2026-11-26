import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '../src/pages/Settings';
import { mockFetch, renderWithProviders, settingsHandler } from './helpers';

describe('Settings page (simplified)', () => {
  it('shows only plain options — no numeric XP knobs — and the penalty switch PUTs penaltyEnabled', async () => {
    const calls = mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && (c.url === '/api/v1/missed-reasons' || c.url === '/api/v1/categories' || c.url.startsWith('/api/v1/checkins')) ? { body: [] } : undefined),
      (c) => (c.method === 'PUT' && c.url === '/api/v1/settings' ? { body: c.body } : undefined),
    );
    renderWithProviders(<SettingsPage />);
    const sw = await screen.findByRole('switch', { name: 'Trừ XP khi bỏ lỡ việc' });
    expect(sw).toBeChecked();
    expect(screen.getByText(/trừ một nửa XP của việc đó/)).toBeInTheDocument();

    const general = screen.getByRole('heading', { name: 'Chung' }).closest('section')!;
    expect(within(general).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByText(/XP mỗi Level|Hệ số nhân|Mục tiêu Pool|Phần trăm phạt|Ngưỡng cảnh báo lịch/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục mặc định' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Múi giờ' })).not.toBeInTheDocument();

    await userEvent.click(sw);
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/v1/settings')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT' && c.url === '/api/v1/settings')!.body).toEqual({ penaltyEnabled: false });
  });
});

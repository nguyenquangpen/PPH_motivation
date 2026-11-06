import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@pph/shared';
import { TaskForm } from '../src/components/TaskForm';
import { expectedXp, expectedXpLabel } from '../src/lib/xp';
import { mockFetch, renderWithProviders, settingsHandler } from './helpers';

describe('Task create form', () => {
  it('shows "0 XP + 10 vào Pool" for contribution 10', async () => {
    const calls = mockFetch(settingsHandler);
    renderWithProviders(<TaskForm />);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/v1/settings')).toBe(true));

    await userEvent.type(screen.getByLabelText('Đóng góp (Contribution)'), '10');
    expect(screen.getByTestId('expected-xp')).toHaveTextContent('0 XP + 10 vào Pool');
  });

  it('preset buttons fill the contribution and the XP preview updates live', async () => {
    mockFetch(settingsHandler);
    renderWithProviders(<TaskForm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Major (100)' }));
    expect(screen.getByLabelText('Đóng góp (Contribution)')).toHaveValue(100);
    const est = screen.getByLabelText('Thời lượng ước tính (phút)');
    await userEvent.clear(est);
    await userEvent.type(est, '120');
    expect(screen.getByTestId('expected-xp')).toHaveTextContent('200 XP');
  });

  it('matches the F-07 examples', () => {
    const s = DEFAULT_SETTINGS;
    expect(expectedXp(100, 120, null, s).immediateXp).toBe(200);
    expect(expectedXp(100, 15, null, s).immediateXp).toBe(50);
    expect(expectedXp(100, 600, null, s).immediateXp).toBe(200);
    expect(expectedXp(100, 120, 45, s).immediateXp).toBe(75);
    expect(expectedXp(50, 60, 90, s).immediateXp).toBe(50);
    expect(expectedXpLabel(expectedXp(19, 60, null, s))).toBe('0 XP + 19 vào Pool');
  });
});

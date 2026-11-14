import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tab } from '@mui/material';
import { ResponsiveTabs } from '../components/ResponsiveTabs';
import { RekapTextModal } from '../components/RekapTextModal';

function ControlledTabs() {
  const [value, setValue] = useState('today');
  return <ResponsiveTabs aria-label="Periode" value={value} onChange={(_, next) => setValue(next)}>
    <Tab value="today" label="Hari Ini" />
    <Tab value="custom" label="Custom" />
  </ResponsiveTabs>;
}

describe('Responsive horizontal tabs', () => {
  it('preserves explicit values, manual keyboard selection, roles and focus', () => {
    render(<ControlledTabs />);
    const today = screen.getByRole('tab', { name: 'Hari Ini' });
    const custom = screen.getByRole('tab', { name: 'Custom' });
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(custom).toHaveFocus();
    expect(today).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(custom);
    expect(custom).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tablist', { name: 'Periode' })).toBeInTheDocument();
  });

  it('keeps recap Custom dates editable and restores preset content', () => {
    render(<RekapTextModal open wallet={{ id: 'local', name: 'Local', creator_id: 'creator',
      balance: 0, entry_count: 0, is_archived: false, created_at: '2026-01-01T00:00:00Z' }}
      entries={[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    const start = screen.getByLabelText('Tanggal Mulai');
    fireEvent.change(start, { target: { value: '2026-01-01' } });
    expect(start).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Tanggal Selesai')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Hari Ini' }));
    expect(screen.queryByLabelText('Tanggal Mulai')).not.toBeInTheDocument();
  });
});

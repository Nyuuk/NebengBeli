import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TablePaginationBar } from '../components/TablePaginationBar';

describe('TablePaginationBar', () => {
  it('shows empty range and accessible selector', () => {
    render(<TablePaginationBar page={1} pageSize={10} total={0} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(screen.getByText('Menampilkan 0–0 dari 0')).toBeTruthy();
    expect(screen.getByLabelText('Baris per halaman')).toBeTruthy();
  });
  it('supports paging, page size and disabled loading state', () => {
    const change = vi.fn(); const sizeChange = vi.fn();
    const { rerender } = render(<TablePaginationBar page={1} pageSize={10} total={25} onPageChange={change} onPageSizeChange={sizeChange} />);
    expect(screen.getByText('Menampilkan 1–10 dari 25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' })); expect(change).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText('Baris per halaman'), { target: { value: '25' } }); expect(sizeChange).toHaveBeenCalledWith(25);
    rerender(<TablePaginationBar page={3} pageSize={10} total={25} loading onPageChange={change} onPageSizeChange={sizeChange} />);
    expect(screen.getByText('Menampilkan 21–25 dari 25')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Baris per halaman')).toHaveProperty('disabled', true);
  });
  it.each([
    { page: 8, total: 25, range: 'Menampilkan 21–25 dari 25' },
    { page: 0, total: 25, range: 'Menampilkan 1–10 dari 25' },
  ])('clamps out-of-range page $page before showing range', ({ page, total, range }) => {
    render(<TablePaginationBar page={page} pageSize={10} total={total} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(screen.getByText(range)).toBeTruthy();
  });
});

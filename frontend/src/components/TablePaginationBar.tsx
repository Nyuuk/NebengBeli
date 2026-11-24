import React from 'react';
import { Box, Pagination, TextField, Typography } from '@mui/material';

export interface TablePaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  page, pageSize, total, loading = false, onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(safePage * pageSize, total);
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mt: 2 }}>
      <Typography variant="body2" color="text.secondary">Menampilkan {start}–{end} dari {total}</Typography>
      <TextField select size="small" label="Baris per halaman" value={pageSize} disabled={loading} onChange={(e) => onPageSizeChange(Number(e.target.value))} sx={{ minWidth: 150 }} SelectProps={{ native: true }}>
        {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
      </TextField>
      <Pagination count={totalPages} page={safePage} onChange={(_, p) => onPageChange(p)} disabled={loading} size="small" />
    </Box>
  );
};

export default TablePaginationBar;

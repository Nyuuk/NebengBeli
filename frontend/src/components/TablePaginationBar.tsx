import React from 'react';
import { Box, Pagination, Select, Typography } from '@mui/material';

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
  const selectId = React.useId();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(safePage * pageSize, total);
  return (
    <Box sx={{
      display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center',
      justifyContent: 'space-between', gap: 2, px: { xs: 2, sm: 2.5 }, py: 1.5,
      borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default',
    }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
        Menampilkan {start}–{end} dari {total}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="label" htmlFor={selectId} variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Baris per halaman
          </Typography>
          <Select
            native size="small" id={selectId} value={pageSize} disabled={loading}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            inputProps={{ 'aria-label': 'Baris per halaman' }}
            sx={{ minWidth: 72, bgcolor: 'background.paper', '& .MuiNativeSelect-select': { py: 0.5, pl: 1.25, pr: 3, fontSize: '0.875rem' } }}
          >
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
        </Box>
        <Pagination count={totalPages} page={safePage} onChange={(_, p) => onPageChange(p)} disabled={loading} size="small" color="primary" shape="rounded" showFirstButton showLastButton />
      </Box>
    </Box>
  );
};

export default TablePaginationBar;

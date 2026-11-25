import React from 'react';
import { alpha } from '@mui/material/styles';
import { Card, CardContent, Typography, Grid, Box, Chip } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { StatementSummary } from '../types';

interface BalanceCardProps {
  summary: StatementSummary;
  walletName?: string;
  isArchived?: boolean;
}

export function formatRupiah(amount: number): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(abs);

  return isNegative ? `-${formatted}` : formatted;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({ summary, walletName, isArchived }) => {
  const balance = summary.current_balance;
  let balanceStatusText = 'Lunas / Seimbang';

  if (balance < 0) {
    balanceStatusText = 'Total Tagihan Belum Dibayar';
  } else if (balance > 0) {
    balanceStatusText = 'Kelebihan Bayar / Saldo Positif';
  }

  return (
    <Card
      elevation={2}
      sx={(theme) => ({
        borderRadius: 2,
        background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        color: theme.palette.common.white,
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
      })}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 1.5,
            mb: 1,
          }}
        >
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 1.2, color: (theme) => alpha(theme.palette.common.white, 0.8) }}>
              {walletName ? `Buku: ${walletName}` : 'Ringkasan Ledger'}
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: 800, mt: 0.5, letterSpacing: -0.5, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}
            >
              {formatRupiah(balance)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {isArchived && (
              <Chip
                label="Diarsipkan"
                size="small"
                sx={(theme) => ({ bgcolor: alpha(theme.palette.common.white, 0.2), color: 'common.white' })}
              />
            )}
            <Chip
              label={balanceStatusText}
              size="small"
              sx={{
                bgcolor: balance === 0 ? 'success.dark' : balance < 0 ? 'error.dark' : 'info.dark',
                color: 'common.white',
                fontWeight: 600,
                height: 'auto',
                '& .MuiChip-label': { whiteSpace: 'normal', display: 'block', py: 0.5 },
              }}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingUpIcon sx={{ color: 'common.white', fontSize: { xs: 16, sm: 20 } }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Total Titipan
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2, fontSize: { xs: '0.85rem', sm: '1rem' } }}>
                {formatRupiah(Math.abs(summary.total_titipan))}
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingDownIcon sx={{ color: 'common.white', fontSize: { xs: 16, sm: 20 } }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Total Bayar (Topup)
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2, fontSize: { xs: '0.85rem', sm: '1rem' } }}>
                {formatRupiah(Math.abs(summary.total_topup))}
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccountBalanceWalletIcon sx={{ color: 'common.white', fontSize: { xs: 16, sm: 20 } }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Entri
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2, fontSize: { xs: '0.85rem', sm: '1rem' } }}>
                {summary.entry_count} Transaksi
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

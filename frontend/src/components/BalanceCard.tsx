import React from 'react';
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

  if (balance > 0) {
    balanceStatusText = 'Total Tagihan Belum Dibayar';
  } else if (balance < 0) {
    balanceStatusText = 'Kelebihan Bayar / Saldo Positif';
  }

  return (
    <Card
      elevation={2}
      sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        color: '#ffffff',
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 1.2, color: 'rgba(255,255,255,0.8)' }}>
              {walletName ? `Buku: ${walletName}` : 'Ringkasan Ledger'}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, letterSpacing: -0.5 }}>
              {formatRupiah(balance)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {isArchived && (
              <Chip
                label="Diarsipkan"
                size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }}
              />
            )}
            <Chip
              label={balanceStatusText}
              size="small"
              sx={{
                bgcolor: balance === 0 ? '#4caf50' : balance > 0 ? '#ff5252' : '#40c4ff',
                color: '#fff',
                fontWeight: 600,
              }}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingUpIcon sx={{ color: '#ff8a80', fontSize: 20 }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  Total Titipan
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2 }}>
                {formatRupiah(summary.total_titipan)}
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrendingDownIcon sx={{ color: '#b9f6ca', fontSize: 20 }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  Total Bayar (Topup)
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2 }}>
                {formatRupiah(Math.abs(summary.total_topup))}
              </Typography>
            </Grid>

            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccountBalanceWalletIcon sx={{ color: '#ffe57f', fontSize: 20 }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  Entri
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.2 }}>
                {summary.entry_count} Transaksi
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

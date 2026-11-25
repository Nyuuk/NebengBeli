import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  ButtonGroup,
  Button,
  Chip,
  LinearProgress,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { alpha } from '@mui/material/styles';
import { formatRupiah } from './BalanceCard';
import { CreatorInsights } from '../types';

interface CreatorInsightsCardProps {
  insights: CreatorInsights;
  onWalletClick?: (walletId: string) => void;
}

export const CreatorInsightsCard: React.FC<CreatorInsightsCardProps> = ({
  insights,
  onWalletClick,
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const trends =
    period === 'daily'
      ? insights.daily_trends || []
      : period === 'weekly'
      ? insights.weekly_trends || []
      : insights.monthly_trends || [];

  const maxVolume = Math.max(...trends.map((t) => t.volume), 1);

  // Sort wallets by highest outstanding balance (most debt owed to creator = most negative first)
  const rankedWallets = [...(insights.wallet_balances || [])]
    .filter((w) => !w.is_archived)
    .sort((a, b) => a.balance - b.balance);

  return (
    <Card elevation={0} sx={{ borderRadius: 1.5, mb: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>

      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssessmentIcon color="primary" />
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700, fontSize: { xs: '1.125rem', sm: '1.25rem' } }}>
              Insight Pembuat & Analisis Piutang
            </Typography>
          </Box>
          {insights.cached_at && (
            <Chip
              label={`Disinkron: ${new Date(insights.cached_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        {/* Top Metric Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
                Total Uang Saya yang Masih di Luar
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'warning.dark', mt: 0.5 }}>
                {formatRupiah(insights.total_money_outside)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Total talangan titipan yang belum dilunasi rekan
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6} sm={4}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 600 }}>
                Buku Aktif Dikelola
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.dark', mt: 0.5 }}>
                {insights.active_wallets_count}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Dari {insights.total_wallets_count} total buku titipan
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6} sm={4}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" sx={{ color: 'info.dark', fontWeight: 600 }}>
                Total Belanja Ditalangi
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.dark', mt: 0.5 }}>
                {formatRupiah(insights.total_titipan_volume)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {insights.total_titipan_count} transaksi titipan
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Charts & Trends Section */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Tren Titipan Belanja
              </Typography>
              <ButtonGroup size="small">
                <Button
                  variant={period === 'daily' ? 'contained' : 'outlined'}
                  onClick={() => setPeriod('daily')}
                >
                  Harian
                </Button>
                <Button
                  variant={period === 'weekly' ? 'contained' : 'outlined'}
                  onClick={() => setPeriod('weekly')}
                >
                  Mingguan
                </Button>
                <Button
                  variant={period === 'monthly' ? 'contained' : 'outlined'}
                  onClick={() => setPeriod('monthly')}
                >
                  Bulanan
                </Button>
              </ButtonGroup>
            </Box>

            {trends.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Belum ada data tren belanja pada periode ini.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {trends.slice(-7).map((t, idx) => {
                  const percent = Math.min(100, Math.round((t.volume / maxVolume) * 100));
                  const label =
                    period === 'daily'
                      ? (t as { date?: string }).date || `Hari ${idx + 1}`
                      : period === 'weekly'
                      ? (t as { week?: string }).week || `Minggu ${idx + 1}`
                      : (t as { month?: string }).month || `Bulan ${idx + 1}`;

                  return (
                    <Box key={idx}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {label} ({t.count}x)
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                          {formatRupiah(t.volume)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percent}
                        sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.200' }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Grid>

          {/* Wallet Debt Ranking */}
          <Grid item xs={12} md={5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Daftar Tagihan Tertinggi (Per Rekan)
            </Typography>

            {rankedWallets.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Tidak ada saldo piutang aktif saat ini.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 220, overflowY: 'auto' }}>
                {rankedWallets.map((w) => (
                  <Box
                    key={w.wallet_id}
                    onClick={() => onWalletClick && onWalletClick(w.wallet_id)}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'grey.50',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: onWalletClick ? 'pointer' : 'default',
                      '&:hover': onWalletClick ? { bgcolor: 'grey.100' } : {},
                    }}
                  >
                    <Box sx={{ overflow: 'hidden', mr: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {w.wallet_name}
                      </Typography>
                      {w.owner_username && (
                        <Typography variant="caption" color="text.secondary">
                          @{w.owner_username}
                        </Typography>
                      )}
                    </Box>

                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        color: w.balance < 0 ? 'error.main' : w.balance > 0 ? 'info.main' : 'success.dark',
                        flexShrink: 0,
                      }}
                    >
                      {formatRupiah(w.balance)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

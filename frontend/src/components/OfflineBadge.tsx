import React from 'react';
import { Box, Chip, Button, Alert, CircularProgress } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import { useOnlineStatus } from '../context/OnlineStatusContext';

export const OfflineBadge: React.FC = () => {
  const { isOnline, pendingCount, isSyncing, triggerSync } = useOnlineStatus();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      {!isOnline && (
        <Alert
          severity="warning"
          icon={<WifiOffIcon />}
          action={
            pendingCount > 0 && (
              <Chip
                label={`${pendingCount} antrean offline`}
                size="small"
                color="warning"
                variant="outlined"
              />
            )
          }
        >
          Anda sedang offline. Entri yang ditambahkan akan disimpan secara lokal di perangkat dan disinkronkan otomatis saat terhubung kembali.
        </Alert>
      )}

      {isOnline && pendingCount > 0 && (
        <Alert
          severity="info"
          icon={isSyncing ? <CircularProgress size={20} /> : <CloudDoneIcon />}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isSyncing}
              startIcon={<SyncIcon />}
              onClick={triggerSync}
            >
              {isSyncing ? 'Menyinkronkan...' : 'Sinkron Sekarang'}
            </Button>
          }
        >
          Ada {pendingCount} entri offline siap disinkronkan ke server.
        </Alert>
      )}
    </Box>
  );
};

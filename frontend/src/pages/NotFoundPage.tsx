import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography variant="h1" sx={{ fontWeight: 800, color: 'primary.main', mb: 2 }}>
          404
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          Halaman Tidak Ditemukan
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Halaman yang Anda tuju tidak tersedia atau telah dipindahkan.
        </Typography>
        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          Kembali ke Beranda
        </Button>
      </Box>
    </Layout>
  );
};

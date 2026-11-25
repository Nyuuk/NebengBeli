import { createTheme } from '@mui/material/styles';

export const appTheme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#9c27b0',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: { primary: '#1e293b' },
    divider: '#e2e8f0',
    grey: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0' },
  },
  typography: {
    fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCardContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: theme.spacing(2),
          [theme.breakpoints.up('sm')]: { padding: theme.spacing(2.5) },
          '&:last-child': {
            paddingBottom: theme.spacing(2),
            [theme.breakpoints.up('sm')]: { paddingBottom: theme.spacing(2.5) },
          },
        }),
      },
    },
    MuiTableHead: { styleOverrides: { root: ({ theme }) => ({ backgroundColor: theme.palette.grey[100] }) } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, fontSize: '0.875rem', padding: '12px 16px' }, body: { padding: '10px 16px' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12 } } },
    MuiDialogTitle: { styleOverrides: { root: { padding: 20, fontWeight: 700 } } },
    MuiDialogContent: { styleOverrides: { root: { padding: 20 } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '12px 20px' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 8 } } },
  },
});

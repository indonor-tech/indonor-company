import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#0f766e', dark: '#115e59', light: '#ccfbf1' },
    secondary: { main: '#f59e0b' },
    background: { default: '#f5f7f8', paper: '#ffffff' },
    text: { primary: '#17212b', secondary: '#667085' }
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    h4: { fontWeight: 750, letterSpacing: '-0.03em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 650 }
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#f5f7f8' }, '*': { boxSizing: 'border-box' } } },
    MuiCard: { styleOverrides: { root: { border: '1px solid #e7ecef', boxShadow: '0 8px 24px rgba(16, 24, 40, .045)', backgroundImage: 'none' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, paddingInline: 16 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 650 } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, color: '#667085', background: '#f8fafb' } } }
  }
});

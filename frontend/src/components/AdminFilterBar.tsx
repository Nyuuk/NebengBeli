import React from 'react';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

export interface AdminFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchLabel?: string;
  searchAriaLabel?: string;
  hasActiveFilters: boolean;
  onReset: () => void;
  children?: React.ReactNode;
}

export const AdminFilterBar: React.FC<AdminFilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  searchAriaLabel,
  hasActiveFilters,
  onReset,
  children,
}) => {
  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        p: { xs: 1.5, sm: 2 },
        mb: 2,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: { xs: 'stretch', sm: 'center' },
          minWidth: 0,
        }}
      >
        <TextField
          size="small"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          label={searchLabel}
          inputProps={{
            'aria-label': searchAriaLabel || searchLabel || searchPlaceholder,
          }}
          sx={{
            flex: { xs: '1 1 auto', sm: '1 1 240px' },
            minWidth: { xs: 0, sm: 220 },
            '& .MuiOutlinedInput-root': {
              borderRadius: 1,
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchValue ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="Hapus pencarian"
                  onClick={() => onSearchChange('')}
                  edge="end"
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

        {children}

        {hasActiveFilters && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={onReset}
            sx={{
              borderRadius: 1,
              whiteSpace: 'nowrap',
              alignSelf: { xs: 'flex-start', sm: 'center' },
            }}
          >
            Reset Filter
          </Button>
        )}
      </Box>
    </Paper>
  );
};

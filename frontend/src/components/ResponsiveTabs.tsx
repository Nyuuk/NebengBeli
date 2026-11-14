import { forwardRef } from 'react';
import { Tabs, TabsProps, TabScrollButton, TabScrollButtonProps } from '@mui/material';

// MUI v5 renders these controls as unnamed divs by default. Keep its scrolling
// handlers/styles, but provide native keyboard activation and accessible names.
const ScrollButton = forwardRef<HTMLButtonElement, TabScrollButtonProps>(
  function ScrollButton(props, ref) {
    return <TabScrollButton {...props} ref={ref} component="button" type="button"
      role="button" aria-disabled={props.disabled} tabIndex={props.disabled ? -1 : 0}
      aria-label={props.direction === 'left' ? 'Geser tab ke kiri' : 'Geser tab ke kanan'} />;
  }
);

// Horizontal tab rows share MUI's native scrolling, focus, and selection mechanics.
// Keep labels at their readable intrinsic width and expose overflow controls on phones.
export type ResponsiveTabsProps = Omit<TabsProps,
  'orientation' | 'variant' | 'scrollButtons' | 'allowScrollButtonsMobile' | 'centered'
>;

export function ResponsiveTabs({ sx, ...props }: ResponsiveTabsProps) {
  return (
    <Tabs
      {...props}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      ScrollButtonComponent={ScrollButton}
      sx={[
        { minWidth: 0, maxWidth: '100%', '& .MuiTab-root': { maxWidth: '100%' } },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}

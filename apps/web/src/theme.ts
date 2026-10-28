import { createTheme } from '@mantine/core';

/** Factory floor: bigger text and buttons, readable at a distance. */
export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '"Noto Sans", "Noto Sans Arabic", system-ui, sans-serif',
  headings: { fontFamily: '"Noto Sans", "Noto Sans Arabic", system-ui, sans-serif' },
  defaultRadius: 'md',
  fontSizes: { xs: '13px', sm: '15px', md: '17px', lg: '19px', xl: '22px' },
  components: {
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
  },
});

import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock clipboard
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: {
    writeText: async () => {},
    readText: async () => '',
  },
});

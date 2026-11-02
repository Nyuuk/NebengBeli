import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

vi.setConfig({ testTimeout: 15000 });

// Mock matchMedia
if (typeof window !== 'undefined') {
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
}

// Mock clipboard
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: {
      writeText: async () => {},
      readText: async () => '',
    },
  });
}

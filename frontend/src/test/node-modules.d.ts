declare module 'fs' {
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'path' {
  export function resolve(...paths: string[]): string;
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: Window & {
      __NEBENGBELI_E2E__?: {
        setOffline: (v: boolean) => void;
        isOffline: () => boolean;
        isSimulatedOffline: () => boolean;
        syncNow: () => Promise<unknown>;
        getPendingCount: () => Promise<number>;
        resetOfflineState: () => void;
      };
      eval: (code: string) => unknown;
    };
  }
}

export {};

declare global {
  interface Window {
    tankGame?: {
      start: () => void;
      pause: () => void;
      resume: () => void;
      reset: () => void;
      destroy: () => void;
    };
  }
}

export const tokens = {
  colors: {
    brand: {
      50: "#eef5ff",
      100: "#d9e7ff",
      500: "#1f6feb",
      600: "#1858c4",
      700: "#14479c",
      900: "#0b2960",
    },
    accent: "#7c3aed",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
  },
  fontFamily: {
    sans: '"Figtree Variable", "Inter", system-ui, sans-serif',
    mono: '"Roboto Mono Variable", ui-monospace, monospace',
  },
} as const;

export type Tokens = typeof tokens;

export default {
  "*.{ts,tsx,js,jsx,json,md,yml,yaml}": ["oxfmt --write"],
  "*.{ts,tsx,js,jsx}": ["oxlint --fix"],
};

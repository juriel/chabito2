/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 28px 80px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};

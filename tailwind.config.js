/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        mica: {
          light: 'rgba(255, 255, 255, 0.6)',
          dark: 'rgba(32, 32, 32, 0.6)',
        },
      },
      backdropBlur: {
        mica: '30px',
      },
      animation: {
        'glow': 'glow 3s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(96, 165, 250, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(96, 165, 250, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}

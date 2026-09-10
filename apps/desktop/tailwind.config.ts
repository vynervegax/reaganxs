import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Orange + Lavender + Dark Brown theme
        brand: {
          orange: '#f97316',
          lavender: '#c084fc',
          brown: '#1c140f',
          'brown-light': '#2a211c',
          'brown-dark': '#0c0a09',
        },
      },
      backgroundImage: {
        'reagan-gradient': 'linear-gradient(135deg, #f97316 0%, #c084fc 100%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
      },
      boxShadow: {
        'glow-orange': '0 0 30px rgba(249, 115, 22, 0.25)',
        'glow-lavender': '0 0 30px rgba(192, 132, 252, 0.2)',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
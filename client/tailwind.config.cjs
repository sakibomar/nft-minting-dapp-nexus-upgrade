/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'nft-darker': '#0a0a1a',
        'nft-dark': '#0f0f23',
        'nft-card': '#141428',
        'nft-border': 'rgba(139, 92, 246, 0.15)',
        'nft-accent': '#8b5cf6',
        'nft-accent-light': '#a78bfa',
        'nft-accent-dark': '#6d28d9',
        'nft-pink': '#ec4899',
        'nft-success': '#10b981',
        'nft-warning': '#f59e0b',
        'nft-error': '#ef4444',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      boxShadow: {
        'nft': '0 8px 32px rgba(139, 92, 246, 0.15)',
        'nft-lg': '0 16px 48px rgba(139, 92, 246, 0.2)',
        'nft-glow': '0 0 30px rgba(139, 92, 246, 0.3)',
      },
    },
  },
  plugins: [],
};

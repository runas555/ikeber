/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        cyan: {
          400: '#00aef0',
          500: '#00aef0',
          600: '#0099d6',
          900: '#0c4a6e'
        },
        pink: {
          400: '#d1267a',
          500: '#d1267a',
          600: '#b81e6d',
          900: '#831843'
        },
        slate: {
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a'
        }
      },
      fontFamily: {
        'manrope': ['Manrope', 'sans-serif']
      },
      animation: {
        'float': 'float 6s ease-in-out infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' }
        }
      }
    },
  },
  plugins: [],
}

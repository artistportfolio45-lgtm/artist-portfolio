/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Public palette driven by the theme selected in Admin Settings.
        charcoal:  { DEFAULT: 'rgb(var(--theme-primary-rgb) / <alpha-value>)', 50: 'rgb(var(--theme-surface-rgb) / <alpha-value>)', 100: 'rgb(var(--theme-border-rgb) / <alpha-value>)', 200: 'rgb(var(--theme-border-rgb) / <alpha-value>)', 900: 'rgb(var(--theme-primary-rgb) / <alpha-value>)' },
        ivory:     { DEFAULT: 'rgb(var(--theme-bg-rgb) / <alpha-value>)', dark: 'rgb(var(--theme-secondary-rgb) / <alpha-value>)' },
        gold:      { DEFAULT: 'rgb(var(--theme-accent-rgb) / <alpha-value>)', light: 'rgb(var(--theme-accent-light-rgb) / <alpha-value>)', dark: 'rgb(var(--theme-accent-dark-rgb) / <alpha-value>)' },
        sage:      { DEFAULT: '#7C8C72', light: '#9BAD90' },
        slate:     { DEFAULT: 'rgb(var(--theme-muted-rgb) / <alpha-value>)', light: 'rgb(var(--theme-muted-rgb) / <alpha-value>)' },
      },
      fontFamily: {
        // Display: Cormorant for editorial elegance
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        // Body: Inter for clean readability  
        body: ['Inter', 'system-ui', 'sans-serif'],
        // Utility: tracking for labels
        label: ['Inter', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

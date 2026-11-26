/**
 * tailwind.config.js
 * -------------------
 * Editorial Clinical design tokens for SmartCare HMS.
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#FFFFFF',
        surface: '#F6F8FB',
        hairline: '#E2E8F0',
        ink: '#0B1220',
        muted: '#526071',
        cobalt: {
          DEFAULT: '#1453D6',
          hover: '#0F44B5',
          tint: '#EEF4FF',
        },
        clinical: {
          success: '#0D7A5F',
          warning: '#B45309',
          danger: '#C82333',
        },
        primary: {
          50: '#EEF4FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#1453D6',
          700: '#0F44B5',
        },
        hospital: {
          blue: '#1453D6',
          green: '#0D7A5F',
          red: '#C82333',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

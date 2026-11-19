/** 
 * tailwind.config.js
 * -------------------
 * Tailwind CSS configuration for SmartCare frontend.
 * 'content' tells Tailwind which files to scan for class names
 * so it can remove unused CSS in production (called "purging").
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",   // scan all JS/JSX/TS/TSX files
  ],
  theme: {
    extend: {
      // Custom SmartCare brand colors
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        hospital: {
          blue:  '#1e40af',
          green: '#065f46',
          red:   '#991b1b',
        }
      },
      // Custom font family
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

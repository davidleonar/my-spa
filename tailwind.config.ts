import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#8B5CF6", // Neon Purple
          glow: "rgba(139, 92, 246, 0.5)",
        },
        secondary: {
          DEFAULT: "#3B82F6", // Electric Blue
        },
        surface: {
          DEFAULT: "rgba(255, 255, 255, 0.03)", // For glass panels
          border: "rgba(255, 255, 255, 0.08)",
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      },
      boxShadow: {
        'neon': '0 0 20px theme("colors.primary.glow")',
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
      }
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050A12",
        panel: "rgba(10,20,35,0.75)",
        stroke: "#1B3A5C",
        bull: "#19F58A",
        bear: "#FF3B5C",
        cyan: "#2DD4FF",
        amber: "#FFB020",
        ink: "#D8E6F5",
        dim: "#6F8AA8",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
        head: ["Orbitron", "Rajdhani", "system-ui", "sans-serif"],
        ui: ["Rajdhani", "Orbitron", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

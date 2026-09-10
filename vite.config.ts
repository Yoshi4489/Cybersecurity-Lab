import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const watch = {
  ignored: ["**/.lab/**", "**/standalone-labs/.runtime/**"],
  ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}),
};

export default defineConfig({
  server: { watch },
  plugins: [vinext()],
});

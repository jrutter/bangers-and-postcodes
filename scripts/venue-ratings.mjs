import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const child = spawn(
  process.execPath,
  ["node_modules/vite-node/vite-node.mjs", "--config", "vitest.config.ts", "scripts/run-venue-ratings.ts"],
  { cwd: root, stdio: "inherit", env: process.env },
)
child.on("exit", (code) => process.exit(code ?? 1))

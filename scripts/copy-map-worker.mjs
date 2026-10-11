import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs")
const destination = new URL("../public/maplibre-gl-worker.mjs", import.meta.url)
mkdirSync(new URL("../public/", import.meta.url), { recursive: true })
copyFileSync(source, destination)

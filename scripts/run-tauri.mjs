import { spawnSync } from 'node:child_process'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const tauriCliPath = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

function hasValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

const args = process.argv.slice(2)
const isBuildCommand = args[0] === 'build'
const shouldAutoDisableSigning =
  !process.env.CI &&
  isBuildCommand &&
  !args.includes('--no-sign') &&
  !hasValue('TAURI_SIGNING_PRIVATE_KEY')

const forwardedArgs = shouldAutoDisableSigning ? [...args, '--no-sign'] : args

if (shouldAutoDisableSigning) {
  console.error('[tolaria] TAURI_SIGNING_PRIVATE_KEY is not set; running `tauri build` with --no-sign for a local unsigned bundle.')
}

const result = spawnSync(process.execPath, [tauriCliPath, ...forwardedArgs], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)
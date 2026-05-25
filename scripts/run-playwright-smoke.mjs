#!/usr/bin/env node

import { spawn } from 'node:child_process'

const forwardedArgs = process.argv.slice(2)
const packageManagerExec = process.env.npm_execpath

function spawnPlaywright() {
  if (packageManagerExec) {
    return spawn(process.execPath, [packageManagerExec, 'exec', 'playwright', 'test', ...forwardedArgs], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
  }

  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe'
    return spawn(comspec, ['/d', '/s', '/c', ['pnpm', 'exec', 'playwright', 'test', ...forwardedArgs].join(' ')], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
  }

  return spawn('pnpm', ['exec', 'playwright', 'test', ...forwardedArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
}

const child = spawnPlaywright()

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import iconv from 'iconv-lite'

export interface PSResult {
  stdout: string
  stderr: string
  code: number | null
}

// Locate git-bash executable — prefer scoop-installed git
function findBashExe(): string {
  // 1. Ask scoop directly where git is installed
  try {
    const gitPrefix = execSync('powershell -NoProfile -NonInteractive -Command "scoop prefix git"', {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    }).trim()
    if (gitPrefix) {
      const bashPath = join(gitPrefix, 'bin', 'bash.exe')
      if (existsSync(bashPath)) return bashPath
    }
  } catch { /* scoop not found or git not installed */ }

  // 2. Check $SCOOP env var
  const scoopEnv = process.env['SCOOP']
  if (scoopEnv) {
    const bashPath = join(scoopEnv, 'apps', 'git', 'current', 'bin', 'bash.exe')
    if (existsSync(bashPath)) return bashPath
  }

  // 3. System-wide git installations
  const candidates = [
    join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return 'bash.exe' // fallback to PATH
}

const BASH_EXE = findBashExe()

/**
 * Execute a command via PowerShell (for Windows-specific ops: check, install, env, migrate).
 * Uses iconv-lite GBK→UTF-8 decoding for Chinese output.
 */
export function execPowerShell(
  command: string,
  onProgress?: (data: string) => void,
  signal?: AbortSignal,
  ...extraArgs: string[]
): Promise<PSResult> {
  return new Promise((resolve, reject) => {
    const spawnArgs = ['-NoProfile', '-NonInteractive', '-Command', command]
    if (extraArgs.length > 0) {
      spawnArgs.push('-args', ...extraArgs)
    }
    const child: ChildProcess = spawn('powershell.exe', spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }
    )

    let stdout = ''
    let stderr = ''

    const stdoutDecoder = iconv.decodeStream('gbk')
    stdoutDecoder.on('data', (text: string) => {
      stdout += text
      onProgress?.(text)
    })
    child.stdout?.pipe(stdoutDecoder)

    const stderrDecoder = iconv.decodeStream('gbk')
    stderrDecoder.on('data', (text: string) => {
      stderr += text
    })
    child.stderr?.pipe(stderrDecoder)

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill()
      })
    }
  })
}

// Strip ANSI escape codes and carriage returns from terminal output
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '')
}

/**
 * Execute a command via git-bash (--login loads user's .bashrc).
 * Uses UTF-8 decoding (git-bash defaults to UTF-8).
 * Strips ANSI color codes and \r from output for clean parsing.
 */
export function execGitBash(
  command: string,
  onProgress?: (data: string) => void,
  signal?: AbortSignal,
  cwd?: string
): Promise<PSResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(BASH_EXE, ['--login', '-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: cwd || undefined,
      }
    )

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = stripAnsi(chunk.toString('utf-8'))
      stdout += text
      onProgress?.(text)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += stripAnsi(chunk.toString('utf-8'))
    })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill()
      })
    }
  })
}

/**
 * Execute a scoop subcommand via git-bash (search, install, update, list, etc.).
 * Uses iconv-lite GBK→UTF-8 decoding because scoop (PowerShell script) outputs GBK
 * on Chinese Windows even when invoked through git-bash.
 */
export function execScoop(
  args: string,
  onProgress?: (data: string) => void,
  signal?: AbortSignal,
  cwd?: string
): Promise<PSResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(BASH_EXE, ['--login', '-c', `scoop ${args}`], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: cwd || undefined,
      }
    )

    let stdout = ''
    let stderr = ''

    const stdoutDecoder = iconv.decodeStream('gbk')
    stdoutDecoder.on('data', (text: string) => {
      const cleaned = stripAnsi(text)
      stdout += cleaned
      onProgress?.(cleaned)
    })
    child.stdout?.pipe(stdoutDecoder)

    const stderrDecoder = iconv.decodeStream('gbk')
    stderrDecoder.on('data', (text: string) => {
      stderr += stripAnsi(text)
    })
    child.stderr?.pipe(stderrDecoder)

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill()
      })
    }
  })
}

export function execScoopJSON<T>(
  args: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    execScoop(args, undefined, signal).then(({ stdout, stderr, code }) => {
      if (code !== 0) {
        reject(new Error(stderr || `scoop exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Failed to parse scoop output as JSON: ${stdout}`))
      }
    })
  })
}

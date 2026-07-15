import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import iconv from 'iconv-lite'

export interface PSResult {
  stdout: string
  stderr: string
  code: number | null
  aborted?: boolean
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
export { BASH_EXE }

function terminateChildProcess(child: ChildProcess): void {
  if (!child.pid) {
    child.kill()
    return
  }

  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('error', () => {
        try { child.kill() } catch { /* already closed */ }
      })
      return
    } catch {
      try { child.kill() } catch { /* already closed */ }
      return
    }
  }

  try { child.kill('SIGTERM') } catch { /* already closed */ }
}

function bindAbortSignal(
  signal: AbortSignal | undefined,
  child: ChildProcess,
  onAbort: () => void
): void {
  if (!signal) return

  const abort = () => {
    onAbort()
    terminateChildProcess(child)
  }

  if (signal.aborted) {
    abort()
    return
  }

  signal.addEventListener('abort', abort, { once: true })
}

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
    let aborted = signal?.aborted ?? false

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
      resolve({ stdout, stderr, code, aborted })
    })

    bindAbortSignal(signal, child, () => { aborted = true })
  })
}

// ANSI color/escape code matcher. Built from char code 27 (ESC) to avoid
// embedding a literal control character in the source (keeps linters happy).
const ANSI_PATTERN = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

// Strip ANSI escape codes and carriage returns from terminal output
function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(/\r/g, '')
}

// Strip ANSI color codes only, KEEPING carriage returns (\r) so the renderer
// can detect progress-bar overwrites (scoop emits \r when downloading files).
function stripAnsiKeepCr(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

/**
 * 行段切割器：把任意长度的 stdout/stderr chunk 精确切成"以 \r 或 \n 结尾的完整行段"再推送，
 * 用于解决 IPC 半包/粘包造成的前端日志错行或缺失。
 *
 * 边界规则：
 *   1. `\n`     —— 视为普通换行结束，输出至上一段末尾（含 `\n`）。
 *   2. `\r\n`   —— 合并为一个 `\n` 边界，避免终端"下载进度回车"被拆成两段。
 *   3. 独立 `\r`—— 视为进度条覆盖回车，作为独立行段推出（前端据此覆盖上一行）。
 *   4. 无换行尾巴 —— 缓存至下次 push 或 flush，绝不吐"半行"到前端。
 *   5. 单段体量超过 SEGMENT_HARD_LIMIT 时强制刷出，防止异常流耗尽内存。
 *
 * @param emit 消费者：一次调用对应"一个完整可展示的行段"。
 */
const SEGMENT_HARD_LIMIT = 64 * 1024
function createLineChunker(emit: (segment: string) => void) {
  let buffer = ''

  function drain() {
    let cursor = 0
    let i = 0
    while (i < buffer.length) {
      const ch = buffer.charCodeAt(i)
      if (ch === 10 /* \n */) {
        emit(buffer.slice(cursor, i + 1))
        cursor = i + 1
        i = cursor
        continue
      }
      if (ch === 13 /* \r */) {
        // \r\n 归并成一段（含 \r\n），单独 \r 作为进度覆盖段推出。
        if (buffer.charCodeAt(i + 1) === 10) {
          emit(buffer.slice(cursor, i + 2))
          cursor = i + 2
          i = cursor
          continue
        }
        emit(buffer.slice(cursor, i + 1))
        cursor = i + 1
        i = cursor
        continue
      }
      i += 1
    }
    buffer = cursor > 0 ? buffer.slice(cursor) : buffer
    if (buffer.length >= SEGMENT_HARD_LIMIT) {
      emit(buffer)
      buffer = ''
    }
  }

  return {
    push(chunk: string) {
      if (!chunk) return
      buffer += chunk
      drain()
    },
    flush() {
      if (buffer.length > 0) {
        emit(buffer)
        buffer = ''
      }
    },
  }
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
    let aborted = signal?.aborted ?? false

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
      resolve({ stdout, stderr, code, aborted })
    })

    bindAbortSignal(signal, child, () => { aborted = true })
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
    let aborted = signal?.aborted ?? false

    const stdoutDecoder = iconv.decodeStream('gbk')
    stdoutDecoder.on('data', (text: string) => {
      // Keep \r for the renderer so it can collapse progress-bar overwrites;
      // strip \r from the accumulated buffer used for parsing (version, tables).
      const withCr = stripAnsiKeepCr(text)
      stdout += withCr.replace(/\r/g, '')
      onProgress?.(withCr)
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
      resolve({ stdout, stderr, code, aborted })
    })

    bindAbortSignal(signal, child, () => { aborted = true })
  })
}


function bashQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

/**
 * Execute a native scoop command with argv-style arguments and stream BOTH stdout/stderr.
 * This is used by long-running terminal workflows where the renderer wants raw Scoop output,
 * including carriage returns (\r) for progress-line overwrites.
 */
export function execScoopRaw(
  args: string[],
  onProgress?: (data: string, stream: 'stdout' | 'stderr') => void,
  signal?: AbortSignal,
  cwd?: string,
  useSudo = false
): Promise<PSResult> {
  return new Promise((resolve, reject) => {
    const command = [
      ...(useSudo ? ['sudo', 'scoop'] : ['scoop']),
      ...args.map(bashQuote),
    ].join(' ')
    const child: ChildProcess = spawn(BASH_EXE, ['--login', '-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: cwd || undefined,
      }
    )

    let stdout = ''
    let stderr = ''
    let aborted = signal?.aborted ?? false

    // 行段切割器：把 iconv chunk 精确切成"以 \r 或 \n 结尾"的完整行段后再 IPC 推送，
    // 从源头杜绝半包/粘包造成的界面日志缺失或重复。
    const stdoutChunker = createLineChunker((segment) => {
      onProgress?.(segment, 'stdout')
    })
    const stderrChunker = createLineChunker((segment) => {
      onProgress?.(segment, 'stderr')
    })

    const stdoutDecoder = iconv.decodeStream('gbk')
    stdoutDecoder.on('data', (text: string) => {
      const withCr = stripAnsiKeepCr(text)
      stdout += withCr.replace(/\r/g, '')
      stdoutChunker.push(withCr)
    })
    child.stdout?.pipe(stdoutDecoder)

    const stderrDecoder = iconv.decodeStream('gbk')
    stderrDecoder.on('data', (text: string) => {
      const withCr = stripAnsiKeepCr(text)
      stderr += withCr.replace(/\r/g, '')
      stderrChunker.push(withCr)
    })
    child.stderr?.pipe(stderrDecoder)

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code) => {
      // 关闭前把缓冲的最后一段无换行尾巴推出，确保导出/展示日志完全对齐终端。
      stdoutChunker.flush()
      stderrChunker.flush()
      resolve({ stdout, stderr, code, aborted })
    })

    bindAbortSignal(signal, child, () => { aborted = true })
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

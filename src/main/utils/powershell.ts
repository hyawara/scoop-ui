import { spawn, ChildProcess } from 'child_process'
import iconv from 'iconv-lite'

export interface PSResult {
  stdout: string
  stderr: string
  code: number | null
}

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

export function execScoop(
  args: string,
  onProgress?: (data: string) => void,
  signal?: AbortSignal
): Promise<PSResult> {
  return execPowerShell(`scoop ${args}`, onProgress, signal)
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

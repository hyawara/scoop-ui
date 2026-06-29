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
  signal?: AbortSignal
): Promise<PSResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }
    )

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = iconv.decode(chunk, 'gbk')
      stdout += text
      onProgress?.(text)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = iconv.decode(chunk, 'gbk')
      stderr += text
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

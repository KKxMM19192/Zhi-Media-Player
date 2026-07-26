import { extname, win32 } from 'node:path'

const supportedExtensions = new Set(['.flac', '.mp3'])

export function isSupportedMusicPath(filePath: string): boolean {
  return supportedExtensions.has(extname(filePath).toLocaleLowerCase('en-US'))
}

export function normalizeWindowsPathForComparison(filePath: string): string {
  const normalized = win32.normalize(filePath.trim())
  const withoutTrailingSeparators = normalized.replace(/[\\/]+$/, '')
  return withoutTrailingSeparators.toLocaleLowerCase('en-US')
}

export function pathsEqual(left: string, right: string): boolean {
  return normalizeWindowsPathForComparison(left) === normalizeWindowsPathForComparison(right)
}

export function uniqueWindowsPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((filePath) => {
    const comparable = normalizeWindowsPathForComparison(filePath)
    if (seen.has(comparable)) {
      return false
    }
    seen.add(comparable)
    return true
  })
}

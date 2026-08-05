import { extname, win32 } from 'node:path'
import { normalizeMusicPathForComparison } from '../../shared/domain/music-path'

const supportedExtensions = new Set(['.flac', '.mp3'])

export function isSupportedMusicPath(filePath: string): boolean {
  return supportedExtensions.has(extname(filePath).toLocaleLowerCase('en-US'))
}

export function normalizeWindowsPathForComparison(filePath: string): string {
  return normalizeMusicPathForComparison(win32.normalize(filePath.trim()))
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

export function mapWindowsPathBetweenRoots(
  filePath: string,
  oldRoot: string,
  newRoot: string
): string | null {
  const relativePath = win32.relative(oldRoot, filePath)
  if (
    relativePath.length === 0 ||
    win32.isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${win32.sep}`)
  ) {
    return null
  }
  return win32.join(newRoot, relativePath)
}

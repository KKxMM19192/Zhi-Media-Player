import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  FolderMatchCandidate,
  FolderMatchResult,
  PathReplacement
} from '../../shared/contracts/app-api'
import {
  MAX_PERSISTED_TREE_DEPTH,
  MAX_PERSISTED_TREE_NODE_COUNT
} from '../../shared/domain/app-state'
import {
  isSupportedMusicPath,
  mapWindowsPathBetweenRoots
} from './path-utils'

interface IndexedRepairFile {
  readonly path: string
  readonly fileName: string
  readonly relativeDirectory: string[]
}

function comparableName(value: string): string {
  return value.toLocaleLowerCase('en-US')
}

function relativeFileKey(relativeDirectory: readonly string[], fileName: string): string {
  return [...relativeDirectory.map(comparableName), comparableName(fileName)].join('\0')
}

function addIndexedFile(
  index: Map<string, IndexedRepairFile[]>,
  key: string,
  file: IndexedRepairFile
): void {
  const matches = index.get(key)
  if (matches) {
    matches.push(file)
  } else {
    index.set(key, [file])
  }
}

async function isSupportedFile(filePath: string): Promise<boolean> {
  if (!isSupportedMusicPath(filePath)) {
    return false
  }
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export async function createDirectoryMigration(
  indexedPaths: readonly string[],
  oldRoot: string,
  newRoot: string
): Promise<{ replacements: PathReplacement[]; unmatchedCount: number }> {
  const replacements: PathReplacement[] = []
  let unmatchedCount = 0
  for (const oldPath of indexedPaths) {
    const mappedPath = mapWindowsPathBetweenRoots(oldPath, oldRoot, newRoot)
    if (!mappedPath || !(await isSupportedFile(mappedPath))) {
      unmatchedCount += 1
      continue
    }
    replacements.push({ oldPath, newPath: mappedPath })
  }
  return { replacements, unmatchedCount }
}

async function scanRepairFiles(
  rootPath: string,
  currentPath: string = rootPath,
  relativeDirectory: readonly string[] = [],
  depth = 0,
  budget = { value: 0 }
): Promise<IndexedRepairFile[]> {
  if (depth > MAX_PERSISTED_TREE_DEPTH) {
    throw new Error('The repair folder exceeds the supported directory depth.')
  }

  const files: IndexedRepairFile[] = []
  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    budget.value += 1
    if (budget.value > MAX_PERSISTED_TREE_NODE_COUNT) {
      throw new Error('The repair folder contains too many entries.')
    }

    const entryPath = join(currentPath, entry.name)
    if (entry.isFile() && isSupportedMusicPath(entry.name)) {
      files.push({
        path: entryPath,
        fileName: entry.name,
        relativeDirectory: [...relativeDirectory]
      })
    } else if (entry.isDirectory()) {
      files.push(
        ...(await scanRepairFiles(
          rootPath,
          entryPath,
          [...relativeDirectory, entry.name],
          depth + 1,
          budget
        ))
      )
    }
  }
  return files
}

export async function matchRepairCandidates(
  rootPath: string,
  candidates: readonly FolderMatchCandidate[]
): Promise<FolderMatchResult> {
  const files = await scanRepairFiles(rootPath)
  const filesByName = new Map<string, IndexedRepairFile[]>()
  const filesByRelativePath = new Map<string, IndexedRepairFile[]>()
  files.forEach((file) => {
    addIndexedFile(filesByName, comparableName(file.fileName), file)
    addIndexedFile(
      filesByRelativePath,
      relativeFileKey(file.relativeDirectory, file.fileName),
      file
    )
  })
  const replacements: FolderMatchResult['replacements'][number][] = []
  const unmatchedKeys: string[] = []
  const ambiguousKeys: string[] = []

  for (const candidate of candidates) {
    const matches =
      candidate.relativeDirectory === null
        ? filesByName.get(comparableName(candidate.fileName)) ?? []
        : filesByRelativePath.get(
            relativeFileKey(candidate.relativeDirectory, candidate.fileName)
          ) ?? []
    if (matches.length === 1) {
      replacements.push({
        key: candidate.key,
        oldPath: candidate.oldPath,
        newPath: matches[0].path
      })
    } else if (matches.length === 0) {
      unmatchedKeys.push(candidate.key)
    } else {
      ambiguousKeys.push(candidate.key)
    }
  }

  return { replacements, unmatchedKeys, ambiguousKeys }
}

export function repairFileName(filePath: string): string {
  return basename(filePath)
}

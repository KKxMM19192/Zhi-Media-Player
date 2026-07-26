import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import { basename, isAbsolute, win32 } from 'node:path'
import type {
  FolderMatchCandidate,
  FolderMatchResult
} from '../../shared/contracts/app-api'
import { APP_IPC_CHANNELS } from '../../shared/contracts/app-api'
import {
  MAX_PERSISTED_TREE_NODE_COUNT,
  type PersistedAppState
} from '../../shared/domain/app-state'
import { flattenTracks } from '../../shared/domain/music-tree'
import {
  createDirectoryMigration,
  matchRepairCandidates
} from '../library/index-repair'
import {
  scanDroppedMusicPaths,
  scanMusicFiles,
  scanMusicFolders
} from '../library/scanner'
import { MediaAccessPolicy, readTrackMetadata } from '../media/media-access'
import { AppStateStore } from '../persistence/state-store'
import { parsePersistedAppState } from '../persistence/state-schema'

const maximumDroppedPathCount = 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32_768) {
    throw new Error('A non-empty string is required.')
  }
  return value
}

function isAbsoluteOnAnyPlatform(filePath: string): boolean {
  return isAbsolute(filePath) || win32.isAbsolute(filePath)
}

function requirePathArray(value: unknown, maximumCount: number): string[] {
  if (!Array.isArray(value) || value.length > maximumCount) {
    throw new Error(`No more than ${maximumCount} paths are allowed.`)
  }
  return value.map((entry) => {
    const filePath = requireString(entry)
    if (!isAbsoluteOnAnyPlatform(filePath)) {
      throw new Error('An absolute path is required.')
    }
    return filePath
  })
}

function requireFolderMatchCandidates(value: unknown): FolderMatchCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_PERSISTED_TREE_NODE_COUNT) {
    throw new Error('The folder repair request contains too many tracks.')
  }
  const keys = new Set<string>()
  return value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error('The folder repair request is invalid.')
    }
    const key = requireString(candidate.key)
    const oldPath = requireString(candidate.oldPath)
    if (keys.has(key) || !isAbsoluteOnAnyPlatform(oldPath)) {
      throw new Error('The folder repair request contains an invalid key or path.')
    }
    keys.add(key)

    let relativeDirectory: string[] | null = null
    if (candidate.relativeDirectory !== null) {
      if (!Array.isArray(candidate.relativeDirectory) || candidate.relativeDirectory.length > 64) {
        throw new Error('The folder repair request contains an invalid relative directory.')
      }
      relativeDirectory = candidate.relativeDirectory.map((segment) => {
        const name = requireString(segment)
        if (name === '.' || name === '..' || /[\\/]/.test(name)) {
          throw new Error('The folder repair request contains an invalid directory name.')
        }
        return name
      })
    }

    return {
      key,
      oldPath,
      fileName: basename(oldPath),
      relativeDirectory
    }
  })
}

function collectPaths(state: PersistedAppState): string[] {
  const trees = [
    state.library,
    state.queue,
    ...state.savedQueues.map((savedQueue) => savedQueue.nodes),
    ...state.queueHistory.map((entry) => entry.nodes),
    ...(state.shuffle ? [state.shuffle.originalQueue] : [])
  ]
  return trees.flatMap((nodes) => flattenTracks(nodes).map((track) => track.path))
}

function requireTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('The request did not originate from the application main frame.')
  }
  return owner
}

async function chooseDirectories(
  owner: BrowserWindow,
  title: string
): Promise<string[] | null> {
  const result = await dialog.showOpenDialog(owner, {
    title,
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths
}

export interface AppIpcOptions {
  readonly stateFilePath: string
  readonly fallbackStateFilePaths?: readonly string[]
}

export function registerAppIpc(
  accessPolicy: MediaAccessPolicy,
  options: AppIpcOptions
): void {
  const stateStore = new AppStateStore(options.stateFilePath, options.fallbackStateFilePaths)
  const windowsReadyToClose = new WeakSet<BrowserWindow>()

  ipcMain.handle(APP_IPC_CHANNELS.loadState, async (event) => {
    requireTrustedSender(event)
    const loaded = await stateStore.load()
    accessPolicy.authorize(collectPaths(loaded.state))
    return loaded
  })

  ipcMain.handle(APP_IPC_CHANNELS.saveState, async (event, value: unknown) => {
    requireTrustedSender(event)
    const state = parsePersistedAppState(value)
    const unauthorizedPath = collectPaths(state).find((filePath) => !accessPolicy.resolve(filePath))
    if (unauthorizedPath) {
      throw new Error('The application state refers to a path that was not authorized.')
    }
    await stateStore.save(state)
  })

  ipcMain.handle(APP_IPC_CHANNELS.chooseFolders, async (event) => {
    const owner = requireTrustedSender(event)
    const dialogOptions: OpenDialogOptions = {
      title: '导入音乐文件夹',
      properties: ['openDirectory', 'multiSelections']
    }
    const result = await dialog.showOpenDialog(owner, dialogOptions)
    if (result.canceled) {
      return []
    }

    const playlists = await scanMusicFolders(result.filePaths)
    accessPolicy.authorize(flattenTracks(playlists).map((track) => track.path))
    return playlists
  })

  ipcMain.handle(APP_IPC_CHANNELS.chooseFiles, async (event) => {
    const owner = requireTrustedSender(event)
    const dialogOptions: OpenDialogOptions = {
      title: '导入音乐',
      filters: [{ name: '音乐文件', extensions: ['flac', 'mp3'] }],
      properties: ['openFile', 'multiSelections']
    }
    const result = await dialog.showOpenDialog(owner, dialogOptions)
    if (result.canceled) {
      return []
    }

    const tracks = await scanMusicFiles(result.filePaths)
    accessPolicy.authorize(tracks.map((track) => track.path))
    return tracks
  })

  ipcMain.handle(APP_IPC_CHANNELS.importDropped, async (event, value: unknown) => {
    requireTrustedSender(event)
    const paths = requirePathArray(value, maximumDroppedPathCount)
    const imported = await scanDroppedMusicPaths(paths)
    accessPolicy.authorize(flattenTracks(imported.nodes).map((track) => track.path))
    return imported
  })

  ipcMain.handle(APP_IPC_CHANNELS.checkTrack, (event, value: unknown) => {
    requireTrustedSender(event)
    return accessPolicy.exists(requireString(value))
  })

  ipcMain.handle(APP_IPC_CHANNELS.checkTracks, async (event, value: unknown) => {
    requireTrustedSender(event)
    const paths = requirePathArray(value, MAX_PERSISTED_TREE_NODE_COUNT)
    if (paths.some((filePath) => !accessPolicy.resolve(filePath))) {
      throw new Error('The availability request refers to an unauthorized path.')
    }
    return accessPolicy.checkMany(paths)
  })

  ipcMain.handle(APP_IPC_CHANNELS.chooseReplacementFile, async (event) => {
    const owner = requireTrustedSender(event)
    const result = await dialog.showOpenDialog(owner, {
      title: '选择替代音乐文件',
      filters: [{ name: '音乐文件', extensions: ['flac', 'mp3'] }],
      properties: ['openFile']
    })
    if (result.canceled) {
      return null
    }
    const [track] = await scanMusicFiles(result.filePaths)
    if (!track) {
      throw new Error('The selected replacement is not a supported music file.')
    }
    accessPolicy.authorize([track.path])
    return track
  })

  ipcMain.handle(APP_IPC_CHANNELS.migrateDirectory, async (event, value: unknown) => {
    const owner = requireTrustedSender(event)
    const paths = requirePathArray(value, MAX_PERSISTED_TREE_NODE_COUNT)
    if (paths.some((filePath) => !accessPolicy.resolve(filePath))) {
      throw new Error('The migration request refers to an unauthorized path.')
    }

    const oldRoots = await chooseDirectories(owner, '选择旧音乐目录')
    if (!oldRoots) {
      return null
    }
    const newRoots = await chooseDirectories(owner, '选择迁移后的新音乐目录')
    if (!newRoots) {
      return null
    }
    const oldRoot = oldRoots[0]
    const newRoot = newRoots[0]
    const migration = await createDirectoryMigration(paths, oldRoot, newRoot)
    accessPolicy.authorize(migration.replacements.map((replacement) => replacement.newPath))
    return { oldRoot, newRoot, ...migration }
  })

  ipcMain.handle(APP_IPC_CHANNELS.matchFolder, async (event, value: unknown): Promise<FolderMatchResult | null> => {
    const owner = requireTrustedSender(event)
    const candidates = requireFolderMatchCandidates(value)
    if (candidates.some((candidate) => !accessPolicy.resolve(candidate.oldPath))) {
      throw new Error('The folder repair request refers to an unauthorized path.')
    }
    const roots = await chooseDirectories(owner, '选择用于匹配音乐的文件夹')
    if (!roots) {
      return null
    }
    const result = await matchRepairCandidates(roots[0], candidates)
    accessPolicy.authorize(result.replacements.map((replacement) => replacement.newPath))
    return result
  })

  ipcMain.handle(APP_IPC_CHANNELS.trackMetadata, async (event, value: unknown) => {
    requireTrustedSender(event)
    const requestedPath = requireString(value)
    const authorizedPath = accessPolicy.resolve(requestedPath)
    if (!authorizedPath) {
      throw new Error('The requested media path is not authorized.')
    }
    return readTrackMetadata(authorizedPath)
  })

  ipcMain.handle(APP_IPC_CHANNELS.issueMediaUrl, (event, value: unknown) => {
    requireTrustedSender(event)
    const token = accessPolicy.issueMediaToken(requireString(value))
    return `sn-media://audio/${token}`
  })

  ipcMain.on(APP_IPC_CHANNELS.closeReady, (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || event.senderFrame !== event.sender.mainFrame) {
      return
    }
    windowsReadyToClose.add(owner)
    owner.close()
  })

  app.on('browser-window-created', (_event, window) => {
    window.on('close', (closeEvent) => {
      if (windowsReadyToClose.has(window) || window.webContents.isDestroyed()) {
        return
      }
      closeEvent.preventDefault()
      window.webContents.send(APP_IPC_CHANNELS.prepareClose)
    })
  })
}

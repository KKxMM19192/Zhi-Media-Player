import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import type { PersistedAppState } from '../../shared/domain/app-state'
import { flattenTracks } from '../../shared/domain/music-tree'
import { APP_IPC_CHANNELS } from '../../shared/contracts/app-api'
import { scanMusicFiles, scanMusicFolders } from '../library/scanner'
import { MediaAccessPolicy, readTrackMetadata } from '../media/media-access'
import { AppStateStore } from '../persistence/state-store'
import { parsePersistedAppState } from '../persistence/state-schema'

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32_768) {
    throw new Error('A non-empty string is required.')
  }
  return value
}

function collectPaths(state: PersistedAppState): string[] {
  return [...flattenTracks(state.library), ...flattenTracks(state.queue)].map((track) => track.path)
}

function requireTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('The request did not originate from the application main frame.')
  }
  return owner
}

export function registerAppIpc(accessPolicy: MediaAccessPolicy): void {
  const stateStore = new AppStateStore(join(app.getPath('userData'), 'silent-nocturne-state.json'))
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
    const options: OpenDialogOptions = {
      title: '导入音乐文件夹',
      properties: ['openDirectory', 'multiSelections']
    }
    const result = await dialog.showOpenDialog(owner, options)
    if (result.canceled) {
      return []
    }

    const playlists = await scanMusicFolders(result.filePaths)
    accessPolicy.authorize(flattenTracks(playlists).map((track) => track.path))
    return playlists
  })

  ipcMain.handle(APP_IPC_CHANNELS.chooseFiles, async (event) => {
    const owner = requireTrustedSender(event)
    const options: OpenDialogOptions = {
      title: '导入音乐',
      filters: [{ name: '音乐文件', extensions: ['flac', 'mp3'] }],
      properties: ['openFile', 'multiSelections']
    }
    const result = await dialog.showOpenDialog(owner, options)
    if (result.canceled) {
      return []
    }

    const tracks = await scanMusicFiles(result.filePaths)
    accessPolicy.authorize(tracks.map((track) => track.path))
    return tracks
  })

  ipcMain.handle(APP_IPC_CHANNELS.checkTrack, (event, value: unknown) => {
    requireTrustedSender(event)
    return accessPolicy.exists(requireString(value))
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

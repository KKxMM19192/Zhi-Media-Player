import { contextBridge, ipcRenderer } from 'electron'
import type { PersistedAppState } from '../shared/domain/app-state'
import {
  APP_IPC_CHANNELS,
  type DesktopPlatform,
  type SilentNocturneApi
} from '../shared/contracts/app-api'

function getDesktopPlatform(): DesktopPlatform {
  if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
    return process.platform
  }

  return 'unknown'
}

const api: SilentNocturneApi = Object.freeze({
  platform: getDesktopPlatform(),
  loadState: () => ipcRenderer.invoke(APP_IPC_CHANNELS.loadState),
  saveState: (state: PersistedAppState) => ipcRenderer.invoke(APP_IPC_CHANNELS.saveState, state),
  chooseMusicFolders: () => ipcRenderer.invoke(APP_IPC_CHANNELS.chooseFolders),
  chooseMusicFiles: () => ipcRenderer.invoke(APP_IPC_CHANNELS.chooseFiles),
  checkTrack: (path: string) => ipcRenderer.invoke(APP_IPC_CHANNELS.checkTrack, path),
  getTrackMetadata: (path: string) => ipcRenderer.invoke(APP_IPC_CHANNELS.trackMetadata, path),
  getMediaUrl: (path: string) => ipcRenderer.invoke(APP_IPC_CHANNELS.issueMediaUrl, path),
  onPrepareClose: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(APP_IPC_CHANNELS.prepareClose, listener)
    return () => ipcRenderer.removeListener(APP_IPC_CHANNELS.prepareClose, listener)
  },
  completeClose: () => ipcRenderer.send(APP_IPC_CHANNELS.closeReady)
})

contextBridge.exposeInMainWorld('silentNocturne', api)

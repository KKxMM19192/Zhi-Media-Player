import { contextBridge } from 'electron'
import type { DesktopPlatform, SilentNocturneApi } from '../shared/contracts/app-api'

function getDesktopPlatform(): DesktopPlatform {
  if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
    return process.platform
  }

  return 'unknown'
}

const api: SilentNocturneApi = Object.freeze({
  platform: getDesktopPlatform()
})

contextBridge.exposeInMainWorld('silentNocturne', api)

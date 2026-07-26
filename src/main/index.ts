import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { registerAppIpc } from './ipc/register-app-ipc'
import { MediaAccessPolicy } from './media/media-access'
import { registerMediaProtocol, registerMediaScheme } from './media/protocol'

const allowedExternalProtocols = new Set(['http:', 'https:'])
const mediaAccessPolicy = new MediaAccessPolicy()

registerMediaScheme()

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    return allowedExternalProtocols.has(new URL(rawUrl).protocol)
  } catch {
    return false
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerMediaProtocol(mediaAccessPolicy)
  registerAppIpc(mediaAccessPolicy)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

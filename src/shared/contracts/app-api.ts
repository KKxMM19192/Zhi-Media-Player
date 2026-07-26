import type { PersistedAppState } from '../domain/app-state'
import type { MusicTreeNode, PlaylistNode, TrackNode } from '../domain/music-tree'

export type DesktopPlatform = 'win32' | 'darwin' | 'linux' | 'unknown'

export interface LoadedAppState {
  readonly state: PersistedAppState
  readonly warning: string | null
}

export interface TrackMetadata {
  readonly durationSeconds: number | null
  readonly coverDataUrl: string | null
}

export const APP_IPC_CHANNELS = {
  loadState: 'app-state:load',
  saveState: 'app-state:save',
  chooseFolders: 'music:choose-folders',
  chooseFiles: 'music:choose-files',
  checkTrack: 'music:check-track',
  trackMetadata: 'music:track-metadata',
  issueMediaUrl: 'music:issue-media-url',
  prepareClose: 'app:prepare-close',
  closeReady: 'app:close-ready'
} as const

/** Capabilities exposed by the sandboxed preload to the renderer. */
export interface SilentNocturneApi {
  readonly platform: DesktopPlatform
  loadState(): Promise<LoadedAppState>
  saveState(state: PersistedAppState): Promise<void>
  chooseMusicFolders(): Promise<PlaylistNode[]>
  chooseMusicFiles(): Promise<TrackNode[]>
  checkTrack(path: string): Promise<boolean>
  getTrackMetadata(path: string): Promise<TrackMetadata>
  getMediaUrl(path: string): Promise<string>
  onPrepareClose(callback: () => void): () => void
  completeClose(): void
}

export type ImportedMusicNode = MusicTreeNode

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

export interface TrackAvailability {
  readonly path: string
  readonly available: boolean
}

export interface DroppedMusicImport {
  readonly nodes: MusicTreeNode[]
  readonly skippedCount: number
}

export interface PathReplacement {
  readonly oldPath: string
  readonly newPath: string
}

export interface DirectoryMigrationResult {
  readonly oldRoot: string
  readonly newRoot: string
  readonly replacements: PathReplacement[]
  readonly unmatchedCount: number
}

export interface FolderMatchCandidate {
  readonly key: string
  readonly oldPath: string
  readonly fileName: string
  /** Null searches recursively; an array requires this exact relative directory. */
  readonly relativeDirectory: readonly string[] | null
}

export interface FolderMatchResult {
  readonly replacements: readonly {
    readonly key: string
    readonly oldPath: string
    readonly newPath: string
  }[]
  readonly unmatchedKeys: string[]
  readonly ambiguousKeys: string[]
}

export const APP_IPC_CHANNELS = {
  loadState: 'app-state:load',
  saveState: 'app-state:save',
  chooseFolders: 'music:choose-folders',
  chooseFiles: 'music:choose-files',
  importDropped: 'music:import-dropped',
  checkTrack: 'music:check-track',
  checkTracks: 'music:check-tracks',
  chooseReplacementFile: 'music:choose-replacement-file',
  migrateDirectory: 'music:migrate-directory',
  matchFolder: 'music:match-folder',
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
  importDroppedMusic(files: readonly File[]): Promise<DroppedMusicImport>
  checkTrack(path: string): Promise<boolean>
  checkTracks(paths: readonly string[]): Promise<TrackAvailability[]>
  chooseReplacementMusicFile(): Promise<TrackNode | null>
  chooseDirectoryMigration(paths: readonly string[]): Promise<DirectoryMigrationResult | null>
  matchMusicInFolder(candidates: readonly FolderMatchCandidate[]): Promise<FolderMatchResult | null>
  getTrackMetadata(path: string): Promise<TrackMetadata>
  getMediaUrl(path: string): Promise<string>
  onPrepareClose(callback: () => void): () => void
  completeClose(): void
}

export type ImportedMusicNode = MusicTreeNode

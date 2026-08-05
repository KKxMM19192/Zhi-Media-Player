import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  createDefaultAppState,
  type PersistedAppState
} from '../../shared/domain/app-state'
import { parsePersistedAppState } from './state-schema'

export interface LoadedAppState {
  readonly state: PersistedAppState
  readonly warning: string | null
}

export class AppStateStore {
  private saveQueue: Promise<void> = Promise.resolve()

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<LoadedAppState> {
    try {
      return this.createLoadedState(await this.readState(this.filePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return this.createRecoveryState()
      }

      return { state: createDefaultAppState(), warning: null }
    }
  }

  public async save(state: PersistedAppState): Promise<void> {
    const saveOperation = this.saveQueue.then(async () => {
      const validated = parsePersistedAppState(state)
      const directory = dirname(this.filePath)
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
      await mkdir(directory, { recursive: true })

      try {
        const fileHandle = await open(temporaryPath, 'wx')
        try {
          await fileHandle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8')
          await fileHandle.sync()
        } finally {
          await fileHandle.close()
        }
        await rename(temporaryPath, this.filePath)
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
      }
    })

    this.saveQueue = saveOperation.catch(() => undefined)
    return saveOperation
  }

  private async readState(filePath: string): Promise<PersistedAppState> {
    const contents = await readFile(filePath, 'utf8')
    return parsePersistedAppState(JSON.parse(contents) as unknown)
  }

  private createLoadedState(
    state: PersistedAppState,
    warning: string | null = null
  ): LoadedAppState {
    return {
      state: {
        ...state,
        playback: { ...state.playback, paused: true }
      },
      warning
    }
  }

  private createRecoveryState(): LoadedAppState {
    return {
      state: createDefaultAppState(),
      warning: '无法读取上次保存的应用状态，已使用安全的空白状态启动。原文件未被覆盖。'
    }
  }
}

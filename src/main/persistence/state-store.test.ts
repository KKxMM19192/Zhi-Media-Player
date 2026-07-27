import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultAppState } from '../../shared/domain/app-state'
import { AppStateStore } from './state-store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('application state store', () => {
  it('round-trips state and always restores paused', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sn-state-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'nested', 'state.json')
    const store = new AppStateStore(filePath)
    const state = {
      ...createDefaultAppState(),
      playback: {
        ...createDefaultAppState().playback,
        paused: false,
        positionSeconds: 42,
        volume: 0.35
      }
    }

    await store.save(state)
    const loaded = await store.load()

    expect(loaded.state.playback).toMatchObject({
      paused: true,
      positionSeconds: 42,
      volume: 0.35
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(state)
  })

  it('returns a safe state without overwriting malformed persisted data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sn-state-invalid-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'state.json')
    const store = new AppStateStore(filePath)
    await writeFile(filePath, '{ not json')

    const loaded = await store.load()

    expect(loaded.warning).not.toBeNull()
    expect(loaded.state).toEqual(createDefaultAppState())
    expect(await readFile(filePath, 'utf8')).toBe('{ not json')
  })

  it('serializes concurrent saves without leaving a partial older state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sn-state-concurrent-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'state.json')
    const store = new AppStateStore(filePath)
    const first = {
      ...createDefaultAppState(),
      playback: { ...createDefaultAppState().playback, positionSeconds: 1 }
    }
    const second = {
      ...createDefaultAppState(),
      playback: { ...createDefaultAppState().playback, positionSeconds: 2 }
    }

    await Promise.all([store.save(first), store.save(second)])

    expect((await store.load()).state.playback.positionSeconds).toBe(2)
  })
})

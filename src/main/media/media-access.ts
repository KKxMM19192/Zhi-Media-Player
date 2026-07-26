import { randomBytes } from 'node:crypto'
import { access } from 'node:fs/promises'
import type { TrackAvailability, TrackMetadata } from '../../shared/contracts/app-api'
import { normalizeWindowsPathForComparison } from '../library/path-utils'

interface ParsedMetadata {
  readonly common: {
    readonly picture?: readonly {
      readonly format: string
      readonly data: Uint8Array
    }[]
  }
  readonly format: {
    readonly duration?: number
  }
}

type ParseFile = (filePath: string) => Promise<ParsedMetadata>

const mediaTokenLifetimeMs = 6 * 60 * 60 * 1000
const maximumEmbeddedCoverBytes = 5 * 1024 * 1024
const supportedCoverFormats = new Set(['image/jpeg', 'image/png', 'image/webp'])

export class MediaAccessPolicy {
  private readonly authorizedPaths = new Map<string, string>()
  private readonly mediaTokens = new Map<string, { filePath: string; expiresAt: number }>()

  public authorize(paths: readonly string[]): void {
    paths.forEach((filePath) => {
      this.authorizedPaths.set(normalizeWindowsPathForComparison(filePath), filePath)
    })
  }

  public resolve(requestedPath: string): string | undefined {
    return this.authorizedPaths.get(normalizeWindowsPathForComparison(requestedPath))
  }

  public async exists(requestedPath: string): Promise<boolean> {
    const authorizedPath = this.resolve(requestedPath)
    if (!authorizedPath) {
      return false
    }

    try {
      await access(authorizedPath)
      return true
    } catch {
      return false
    }
  }

  public async checkMany(requestedPaths: readonly string[]): Promise<TrackAvailability[]> {
    const results = new Array<TrackAvailability>(requestedPaths.length)
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < requestedPaths.length) {
        const index = nextIndex
        nextIndex += 1
        const path = requestedPaths[index]
        results[index] = { path, available: await this.exists(path) }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(16, requestedPaths.length) }, () => worker())
    )
    return results
  }

  public issueMediaToken(requestedPath: string): string {
    const filePath = this.resolve(requestedPath)
    if (!filePath) {
      throw new Error('The requested media path is not authorized.')
    }

    const now = Date.now()
    for (const [token, capability] of this.mediaTokens) {
      if (capability.expiresAt <= now) {
        this.mediaTokens.delete(token)
      }
    }

    const token = randomBytes(32).toString('base64url')
    this.mediaTokens.set(token, {
      filePath,
      expiresAt: now + mediaTokenLifetimeMs
    })
    return token
  }

  public resolveMediaToken(token: string): string | undefined {
    const capability = this.mediaTokens.get(token)
    if (!capability) {
      return undefined
    }
    if (capability.expiresAt <= Date.now()) {
      this.mediaTokens.delete(token)
      return undefined
    }
    return capability.filePath
  }
}

export async function readTrackMetadata(filePath: string): Promise<TrackMetadata> {
  // The runtime Node entry exposes parseFile, while the bundler-facing declaration omits it.
  const metadataModule = (await import('music-metadata')) as unknown as { parseFile: ParseFile }
  const parseFile = metadataModule.parseFile
  const metadata = await parseFile(filePath)
  const picture = metadata.common.picture?.[0]
  return {
    durationSeconds:
      typeof metadata.format.duration === 'number' ? metadata.format.duration : null,
    coverDataUrl:
      picture &&
      supportedCoverFormats.has(picture.format.toLocaleLowerCase('en-US')) &&
      picture.data.byteLength <= maximumEmbeddedCoverBytes
      ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
      : null
  }
}

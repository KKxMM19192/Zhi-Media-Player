import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { MediaAccessPolicy } from './media-access'

export const MEDIA_PROTOCOL = 'sn-media'

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

export function registerMediaProtocol(accessPolicy: MediaAccessPolicy): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'audio' || request.method !== 'GET') {
      return new Response(null, { status: 404 })
    }

    const token = url.pathname.slice(1)
    const filePath = accessPolicy.resolveMediaToken(token)
    if (!filePath) {
      return new Response(null, { status: 404 })
    }

    try {
      const fileStat = await stat(filePath)
      const range = request.headers.get('range')
      const contentType =
        extname(filePath).toLocaleLowerCase('en-US') === '.flac' ? 'audio/flac' : 'audio/mpeg'
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      })

      let start = 0
      let end = fileStat.size - 1
      let status = 200
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (match[1] === '' && match[2] === '')) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileStat.size}` }
          })
        }

        if (match[1] === '') {
          const suffixLength = Number(match[2])
          start = Math.max(0, fileStat.size - suffixLength)
        } else {
          start = Number(match[1])
        }
        if (match[2] !== '' && match[1] !== '') {
          end = Math.min(Number(match[2]), fileStat.size - 1)
        }

        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileStat.size}` }
          })
        }
        status = 206
        headers.set('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
      }

      headers.set('Content-Length', String(end - start + 1))
      const stream = Readable.toWeb(createReadStream(filePath, { start, end }))
      return new Response(stream as ReadableStream, { status, headers })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

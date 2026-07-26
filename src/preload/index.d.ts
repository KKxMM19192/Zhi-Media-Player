import type { SilentNocturneApi } from '../shared/contracts/app-api'

declare global {
  interface Window {
    readonly silentNocturne: SilentNocturneApi
  }
}

export {}

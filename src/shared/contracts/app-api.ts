export type DesktopPlatform = 'win32' | 'darwin' | 'linux' | 'unknown'

/** Capabilities exposed by the sandboxed preload to the renderer. */
export interface SilentNocturneApi {
  readonly platform: DesktopPlatform
}

import type { TreeSource } from './stores/app-store'

export const TREE_DRAG_TYPE_PREFIX = 'application/x-silent-nocturne-tree-'
export const SAVED_QUEUE_DRAG_TYPE = 'application/x-silent-nocturne-saved-queue'

export function isExternalFileDrag(event: DragEvent): boolean {
  const transfer = event.dataTransfer
  return Boolean(
    transfer &&
      (transfer.files.length > 0 || Array.from(transfer.types).includes('Files'))
  )
}

export function applyTreeDropEffect(event: DragEvent, targetSource: TreeSource): void {
  event.preventDefault()
  const transfer = event.dataTransfer
  if (!transfer) {
    return
  }

  const types = Array.from(transfer.types)
  const sourceType = types.find((type) => type.startsWith(TREE_DRAG_TYPE_PREFIX))
  const source = sourceType?.slice(TREE_DRAG_TYPE_PREFIX.length) ?? ''
  transfer.dropEffect =
    isExternalFileDrag(event) ||
    types.includes(SAVED_QUEUE_DRAG_TYPE) ||
    (source !== '' && source !== targetSource)
      ? 'copy'
      : 'move'
}

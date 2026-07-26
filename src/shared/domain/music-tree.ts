export type NodeId = string

export interface TrackNode {
  readonly id: NodeId
  readonly type: 'track'
  readonly name: string
  readonly path: string
}

export interface PlaylistNode {
  readonly id: NodeId
  readonly type: 'playlist'
  readonly name: string
  readonly children: MusicTreeNode[]
}

export type MusicTreeNode = TrackNode | PlaylistNode

export interface NodeLocation {
  readonly node: MusicTreeNode
  readonly parentId: NodeId | null
  readonly index: number
}

export interface TreeDestination {
  readonly parentId: NodeId | null
  /** Child index in the tree before selected nodes are removed. */
  readonly index: number
}

export type NodeIdFactory = () => NodeId

export function createNodeId(): NodeId {
  return globalThis.crypto.randomUUID()
}

export function walkTree(
  nodes: readonly MusicTreeNode[],
  visitor: (node: MusicTreeNode, parentId: NodeId | null, index: number) => void,
  parentId: NodeId | null = null
): void {
  nodes.forEach((node, index) => {
    visitor(node, parentId, index)
    if (node.type === 'playlist') {
      walkTree(node.children, visitor, node.id)
    }
  })
}

export function flattenTree(nodes: readonly MusicTreeNode[]): MusicTreeNode[] {
  const flattened: MusicTreeNode[] = []
  walkTree(nodes, (node) => flattened.push(node))
  return flattened
}

export function isWithinTreeNodeLimit(
  nodes: readonly MusicTreeNode[],
  maximumNodeCount: number
): boolean {
  let nodeCount = 0
  const visit = (siblings: readonly MusicTreeNode[]): boolean => {
    for (const node of siblings) {
      nodeCount += 1
      if (nodeCount > maximumNodeCount) {
        return false
      }
      if (node.type === 'playlist' && !visit(node.children)) {
        return false
      }
    }
    return true
  }
  return visit(nodes)
}

export function flattenTracks(nodes: readonly MusicTreeNode[]): TrackNode[] {
  return flattenTree(nodes).filter((node): node is TrackNode => node.type === 'track')
}

export function findNode(
  nodes: readonly MusicTreeNode[],
  nodeId: NodeId
): MusicTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }

    if (node.type === 'playlist') {
      const descendant = findNode(node.children, nodeId)
      if (descendant) {
        return descendant
      }
    }
  }

  return undefined
}

export function findNodeLocation(
  nodes: readonly MusicTreeNode[],
  nodeId: NodeId,
  parentId: NodeId | null = null
): NodeLocation | undefined {
  for (const [index, node] of nodes.entries()) {
    if (node.id === nodeId) {
      return { node, parentId, index }
    }

    if (node.type === 'playlist') {
      const descendant = findNodeLocation(node.children, nodeId, node.id)
      if (descendant) {
        return descendant
      }
    }
  }

  return undefined
}

export function collectSubtreeIds(node: MusicTreeNode): NodeId[] {
  const ids = [node.id]
  if (node.type === 'playlist') {
    walkTree(node.children, (descendant) => ids.push(descendant.id))
  }
  return ids
}

export function normalizeSelectedRootIds(
  nodes: readonly MusicTreeNode[],
  selectedIds: ReadonlySet<NodeId>
): NodeId[] {
  const normalized: NodeId[] = []

  const visit = (siblings: readonly MusicTreeNode[], ancestorSelected: boolean): void => {
    for (const node of siblings) {
      const selected = selectedIds.has(node.id)
      if (selected && !ancestorSelected) {
        normalized.push(node.id)
      }

      if (node.type === 'playlist') {
        visit(node.children, ancestorSelected || selected)
      }
    }
  }

  visit(nodes, false)
  return normalized
}

export function cloneTreeWithNewIds(
  nodes: readonly MusicTreeNode[],
  idFactory: NodeIdFactory = createNodeId
): MusicTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'track') {
      return { ...node, id: idFactory() }
    }

    return {
      ...node,
      id: idFactory(),
      children: cloneTreeWithNewIds(node.children, idFactory)
    }
  })
}

export function containsAnyNode(
  nodes: readonly MusicTreeNode[],
  candidateRootIds: readonly NodeId[],
  targetNodeId: NodeId
): boolean {
  return candidateRootIds.some((candidateId) => {
    const candidate = findNode(nodes, candidateId)
    return candidate ? collectSubtreeIds(candidate).includes(targetNodeId) : false
  })
}

export function removeNodes(
  nodes: readonly MusicTreeNode[],
  selectedIds: ReadonlySet<NodeId>
): { nodes: MusicTreeNode[]; removed: MusicTreeNode[]; rootIds: NodeId[] } {
  const rootIds = normalizeSelectedRootIds(nodes, selectedIds)
  const roots = new Set(rootIds)
  const removed: MusicTreeNode[] = []

  const removeFrom = (siblings: readonly MusicTreeNode[]): MusicTreeNode[] => {
    const result: MusicTreeNode[] = []
    for (const node of siblings) {
      if (roots.has(node.id)) {
        removed.push(node)
      } else if (node.type === 'playlist') {
        result.push({ ...node, children: removeFrom(node.children) })
      } else {
        result.push(node)
      }
    }
    return result
  }

  return { nodes: removeFrom(nodes), removed, rootIds }
}

export function insertNodes(
  nodes: readonly MusicTreeNode[],
  additions: readonly MusicTreeNode[],
  destination: TreeDestination
): MusicTreeNode[] {
  const insertInto = (siblings: readonly MusicTreeNode[], parentId: NodeId | null): MusicTreeNode[] => {
    if (parentId === destination.parentId) {
      const next = [...siblings]
      const index = Math.max(0, Math.min(destination.index, next.length))
      next.splice(index, 0, ...additions)
      return next
    }

    return siblings.map((node) => {
      if (node.type !== 'playlist') {
        return node
      }
      return { ...node, children: insertInto(node.children, node.id) }
    })
  }

  if (destination.parentId !== null) {
    const parent = findNode(nodes, destination.parentId)
    if (!parent || parent.type !== 'playlist') {
      throw new Error('The destination playlist does not exist.')
    }
  }

  return insertInto(nodes, null)
}

export function moveNodes(
  nodes: readonly MusicTreeNode[],
  selectedIds: ReadonlySet<NodeId>,
  destination: TreeDestination
): MusicTreeNode[] {
  const rootIds = normalizeSelectedRootIds(nodes, selectedIds)
  if (rootIds.length === 0) {
    return [...nodes]
  }

  if (
    destination.parentId &&
    rootIds.some((rootId) => {
      const root = findNode(nodes, rootId)
      return root ? collectSubtreeIds(root).includes(destination.parentId as NodeId) : false
    })
  ) {
    throw new Error('A node cannot be moved inside itself or one of its descendants.')
  }

  const locations = rootIds
    .map((nodeId) => findNodeLocation(nodes, nodeId))
    .filter((location): location is NodeLocation => location !== undefined)
  const adjustedIndex =
    destination.index -
    locations.filter(
      (location) => location.parentId === destination.parentId && location.index < destination.index
    ).length
  const extracted = removeNodes(nodes, new Set(rootIds))

  return insertNodes(extracted.nodes, extracted.removed, {
    parentId: destination.parentId,
    index: adjustedIndex
  })
}

export function getSelectionState(
  node: MusicTreeNode,
  selectedIds: ReadonlySet<NodeId>
): 'none' | 'partial' | 'all' {
  const ids = collectSubtreeIds(node)
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length
  if (selectedCount === 0) {
    return 'none'
  }
  return selectedCount === ids.length ? 'all' : 'partial'
}

export function toggleNodeSelection(
  node: MusicTreeNode,
  selectedIds: ReadonlySet<NodeId>,
  roots?: readonly MusicTreeNode[]
): Set<NodeId> {
  const next = new Set(selectedIds)
  const subtreeIds = collectSubtreeIds(node)
  const shouldSelect = subtreeIds.some((id) => !next.has(id))
  subtreeIds.forEach((id) => {
    if (shouldSelect) {
      next.add(id)
    } else {
      next.delete(id)
    }
  })

  if (!shouldSelect && roots) {
    const removeSelectedAncestors = (
      siblings: readonly MusicTreeNode[],
      ancestors: readonly NodeId[]
    ): boolean => {
      for (const candidate of siblings) {
        if (candidate.id === node.id) {
          ancestors.forEach((ancestorId) => next.delete(ancestorId))
          return true
        }
        if (
          candidate.type === 'playlist' &&
          removeSelectedAncestors(candidate.children, [...ancestors, candidate.id])
        ) {
          return true
        }
      }
      return false
    }
    removeSelectedAncestors(roots, [])
  }

  return next
}

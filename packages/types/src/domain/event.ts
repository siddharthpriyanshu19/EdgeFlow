/**
 * Sync Engine event types.
 *
 * Every event is immutable, versioned, and replayable.
 * The event log is the source of truth for canvas state.
 */

export type CanvasEventType =
  | 'NodeCreated'
  | 'NodeDeleted'
  | 'NodeMoved'
  | 'NodeResized'
  | 'NodeRotated'
  | 'NodeRenamed'
  | 'NodeColorChanged'
  | 'ConnectionCreated'
  | 'ConnectionDeleted'
  | 'PropertyUpdated'
  | 'CommentAdded'
  | 'CommentResolved'
  | 'SelectionChanged'
  | 'ViewportChanged'
  | 'CursorMoved'
  | 'UndoRedo'
  | 'ZoomChanged'
  | 'PanChanged'
  | 'SnapshotRestored'
  | 'LayerCreated'
  | 'LayerUpdated'
  | 'GroupCreated'
  | 'GroupUpdated';

/**
 * The canonical structure of every event in the system.
 * TPayload allows each event type to be narrowed safely.
 */
export interface CanvasEvent<TPayload = unknown> {
  /** Globally unique event ID (UUID v7 for sortability) */
  id: string;
  /** Monotonically increasing per-room sequence number */
  sequenceNumber: number;
  /** Canvas version at the time of the event */
  version: number;
  type: CanvasEventType;
  workspaceId: string;
  projectId: string;
  userId: string;
  /** UTC ISO 8601 timestamp */
  timestamp: string;
  payload: TPayload;
}

// ─── Typed payloads ─────────────────────────────────────────────────────────

export interface NodeCreatedPayload {
  node: import('./canvas.js').CanvasNode;
}

export interface NodeDeletedPayload {
  nodeId: string;
}

export interface NodeMovedPayload {
  nodeId: string;
  position: import('./canvas.js').NodePosition;
  previousPosition: import('./canvas.js').NodePosition;
}

export interface NodeResizedPayload {
  nodeId: string;
  size: import('./canvas.js').NodeSize;
  previousSize: import('./canvas.js').NodeSize;
}

export interface NodeRotatedPayload {
  nodeId: string;
  rotation: number;
  previousRotation: number;
}

export interface NodeRenamedPayload {
  nodeId: string;
  name: string;
  previousName: string;
}

export interface NodeColorChangedPayload {
  nodeId: string;
  color: string;
  previousColor: string | null;
}

export interface ConnectionCreatedPayload {
  connection: import('./canvas.js').CanvasConnection;
}

export interface ConnectionDeletedPayload {
  connectionId: string;
}

export interface PropertyUpdatedPayload {
  nodeId: string;
  propertyKey: string;
  value: unknown;
  previousValue: unknown;
}

export interface CursorMovedPayload {
  x: number;
  y: number;
}

export interface ViewportChangedPayload {
  viewport: import('./canvas.js').Viewport;
}

export interface ZoomChangedPayload {
  zoom: number;
  previousZoom: number;
}

export interface PanChangedPayload {
  x: number;
  y: number;
}

export interface UndoRedoPayload {
  action: 'undo' | 'redo';
  targetSequenceNumber: number;
}

export interface SelectionChangedPayload {
  selectedNodeIds: string[];
  selectedConnectionIds: string[];
}

export interface CommentAddedPayload {
  commentId: string;
  body: string;
  anchor:
    | { type: 'node'; nodeId: string }
    | { type: 'connection'; connectionId: string }
    | { type: 'canvas'; x: number; y: number };
  parentCommentId: string | null;
}

export interface CommentResolvedPayload {
  commentId: string;
  resolvedByUserId: string;
}

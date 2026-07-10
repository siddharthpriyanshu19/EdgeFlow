/**
 * Presence domain types.
 * Describes the real-time state of a user within a collaboration room.
 */

export type PresenceStatus = 'ONLINE' | 'IDLE' | 'OFFLINE';

export interface UserPresence {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Hex color assigned to the user for this room session */
  color: string;
  status: PresenceStatus;
  cursor: CursorPosition | null;
  viewport: import('./canvas.js').Viewport | null;
  selectedNodeIds: string[];
  selectedConnectionIds: string[];
  activeTool: string | null;
  lastSeenAt: string;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface RoomPresence {
  roomId: string;
  projectId: string;
  users: UserPresence[];
}

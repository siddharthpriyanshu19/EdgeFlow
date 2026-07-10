/**
 * Realtime collaboration layer.
 *
 * Connects to the EdgeFlow Sync Engine over Socket.IO, rebuilds canvas state
 * from a snapshot + replayed event log, and exposes a React hook that keeps a
 * React Flow graph in sync with the room. All local edits are applied
 * optimistically and mirrored to the room as immutable `CanvasEvent`s.
 *
 * Event folding is intentionally idempotent, so re-applying an echoed event
 * (the server confirms the sender's own events) is a no-op.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';
import {
  categoryColor,
  protocolColor,
  toDomainCategory,
  type ConnectionProtocol,
  type LibraryComponent,
  type NodeMetadata,
} from './components';

// ─── Node / edge data carried inside React Flow objects ────────────────────────

export type ComponentNodeData = {
  label: string;
  componentType: string;
  category: string;
  color: string;
  metadata: NodeMetadata;
  status?: string;
};

export type ComponentEdgeData = {
  protocol: ConnectionProtocol;
};

export type FlowNode = Node<ComponentNodeData>;
export type FlowEdge = Edge<ComponentEdgeData>;

// ─── Wire types ────────────────────────────────────────────────────────────────

type CanvasEventType =
  | 'NodeCreated' | 'NodeDeleted' | 'NodeMoved' | 'NodeResized'
  | 'NodeRenamed' | 'NodeColorChanged' | 'PropertyUpdated'
  | 'ConnectionCreated' | 'ConnectionDeleted';

type WireEvent = {
  id: string;
  sequenceNumber?: number;
  version?: number;
  type: CanvasEventType | string;
  workspaceId: string;
  projectId: string;
  userId?: string;
  timestamp?: string;
  payload: any;
};

export type PresenceUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  status: 'ONLINE' | 'IDLE' | 'OFFLINE';
  selectedNodeIds?: string[];
  activeTool?: string | null;
};

export type RemoteCursor = { x: number; y: number; color: string; name: string };

const DEFAULT_SIZE = { width: 190, height: 76 };

// ─── Node / edge construction helpers ──────────────────────────────────────────

function serializedToNode(raw: any): FlowNode {
  const position = raw.position ?? { x: raw.positionX ?? 0, y: raw.positionY ?? 0 };
  const size = raw.size ?? { width: raw.width ?? DEFAULT_SIZE.width, height: raw.height ?? DEFAULT_SIZE.height };
  const metadata: NodeMetadata = raw.metadata ?? { name: raw.componentType };
  const color = raw.color ?? '#2563eb';
  return {
    id: raw.id,
    type: 'component',
    position: { x: position.x, y: position.y },
    width: size.width,
    height: size.height,
    data: {
      label: metadata.name ?? raw.componentType,
      componentType: raw.componentType,
      category: raw.category,
      color,
      metadata,
    },
  };
}

function serializedToEdge(raw: any): FlowEdge {
  const protocol: ConnectionProtocol = raw.protocol ?? 'HTTP';
  return styleEdge({
    id: raw.id,
    source: raw.sourceNodeId ?? raw.source,
    target: raw.targetNodeId ?? raw.target,
    sourceHandle: raw.sourceHandle ?? null,
    targetHandle: raw.targetHandle ?? null,
    data: { protocol },
  });
}

export function styleEdge(edge: FlowEdge): FlowEdge {
  const protocol = edge.data?.protocol ?? 'HTTP';
  const color = protocolColor(protocol);
  const dashed = protocol === 'UDP' || protocol === 'REDIS_PUBSUB' || protocol === 'GRPC';
  return {
    ...edge,
    type: 'smoothstep',
    animated: true,
    label: protocol,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: 'var(--edge-label-bg)', stroke: color, strokeWidth: 1 },
    markerEnd: { type: 'arrowclosed', color, width: 18, height: 18 } as any,
    style: { stroke: color, strokeWidth: 1.8, strokeDasharray: dashed ? '6 4' : undefined },
  };
}

// Fold a single event into the working node/edge maps.
function applyEvent(event: WireEvent, nodes: Map<string, FlowNode>, edges: Map<string, FlowEdge>): void {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'NodeCreated':
      if (p.node) nodes.set(p.node.id, serializedToNode(p.node));
      break;
    case 'NodeDeleted':
      nodes.delete(p.nodeId);
      for (const [id, e] of edges) if (e.source === p.nodeId || e.target === p.nodeId) edges.delete(id);
      break;
    case 'NodeMoved': {
      const n = nodes.get(p.nodeId);
      if (n && p.position) nodes.set(p.nodeId, { ...n, position: { ...p.position } });
      break;
    }
    case 'NodeResized': {
      const n = nodes.get(p.nodeId);
      if (n && p.size) nodes.set(p.nodeId, { ...n, width: p.size.width, height: p.size.height });
      break;
    }
    case 'NodeRenamed': {
      const n = nodes.get(p.nodeId);
      if (n) nodes.set(p.nodeId, { ...n, data: { ...n.data, label: p.name, metadata: { ...n.data.metadata, name: p.name } } });
      break;
    }
    case 'NodeColorChanged': {
      const n = nodes.get(p.nodeId);
      if (n) nodes.set(p.nodeId, { ...n, data: { ...n.data, color: p.color } });
      break;
    }
    case 'PropertyUpdated': {
      if (p.nodeId) {
        const n = nodes.get(p.nodeId);
        if (n) nodes.set(p.nodeId, { ...n, data: { ...n.data, metadata: { ...n.data.metadata, [p.propertyKey]: p.value } } });
      } else if (p.connectionId) {
        const e = edges.get(p.connectionId);
        if (e && p.propertyKey === 'protocol') edges.set(p.connectionId, styleEdge({ ...e, data: { ...e.data, protocol: p.value } }));
      }
      break;
    }
    case 'ConnectionCreated':
      if (p.connection) edges.set(p.connection.id, serializedToEdge(p.connection));
      break;
    case 'ConnectionDeleted':
      edges.delete(p.connectionId);
      break;
    default:
      break;
  }
}

function rebuild(snapshotState: any, events: WireEvent[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = new Map<string, FlowNode>();
  const edges = new Map<string, FlowEdge>();

  if (snapshotState?.nodes) for (const n of snapshotState.nodes) nodes.set(n.id, serializedToNode(n));
  if (snapshotState?.connections) for (const c of snapshotState.connections) edges.set(c.id, serializedToEdge(c));

  for (const e of events) applyEvent(e, nodes, edges);

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// ─── Socket URL resolution ─────────────────────────────────────────────────────

function socketConfig(): { url: string | undefined; path: string } {
  const url = (import.meta.env['VITE_WS_URL'] as string | undefined) || undefined;
  const path = (import.meta.env['VITE_WS_PATH'] as string | undefined) || '/ws';
  return { url, path };
}

let uid = 0;
function eventId(): string {
  // Sortable-enough unique id for client-originated events.
  uid += 1;
  return `evt-${Date.now().toString(36)}-${uid.toString(36)}-${Math.floor(performance.now() % 1e6).toString(36)}`;
}

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error';

export type UseRoomResult = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  connection: ConnectionState;
  presence: PresenceUser[];
  cursors: Record<string, RemoteCursor>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addComponent: (component: LibraryComponent, position: { x: number; y: number }) => FlowNode;
  connectNodes: (conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => void;
  renameNode: (nodeId: string, name: string) => void;
  recolorNode: (nodeId: string, color: string) => void;
  updateProperty: (nodeId: string, key: string, value: string | number) => void;
  setEdgeProtocol: (edgeId: string, protocol: ConnectionProtocol) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  pushCursor: (x: number, y: number) => void;
  updateSelection: (nodeIds: string[]) => void;
};

/**
 * Live room hook. `projectId === null` means "offline mode" — the canvas still
 * works locally (no socket), which keeps the editor usable without a backend.
 */
export function useRoom(
  workspaceId: string | null,
  projectId: string | null,
  seed: { nodes: FlowNode[]; edges: FlowEdge[] },
): UseRoomResult {
  const [nodes, setNodes] = useState<FlowNode[]>(seed.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(seed.edges);
  const [connection, setConnection] = useState<ConnectionState>(projectId ? 'connecting' : 'offline');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const socketRef = useRef<Socket | null>(null);
  const cursorThrottle = useRef(0);
  const presenceRef = useRef<PresenceUser[]>([]);
  presenceRef.current = presence;

  const emit = useCallback(
    (type: CanvasEventType, payload: unknown) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected || !projectId) return;
      socket.emit('canvas:event', {
        id: eventId(),
        type,
        workspaceId: workspaceId ?? '',
        projectId,
        payload,
      });
    },
    [projectId, workspaceId],
  );

  // ── Socket lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      setConnection('offline');
      return;
    }

    setConnection('connecting');
    const { url, path } = socketConfig();
    const socket = url
      ? io(url, { path, auth: { token: getAccessToken() }, transports: ['websocket', 'polling'] })
      : io({ path, auth: { token: getAccessToken() }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnection('online');
      socket.emit('room:join', { projectId, lastSequenceNumber: 0 });
    });

    socket.on('connect_error', () => setConnection('error'));
    socket.on('disconnect', () => setConnection('offline'));

    socket.on('room:joined', (data: { snapshot: any; missedEvents: WireEvent[]; presence: PresenceUser[] }) => {
      const built = rebuild(data.snapshot, data.missedEvents ?? []);
      // Merge server state over any local seed, preferring server truth.
      setNodes((local) => mergeById(local, built.nodes));
      setEdges((local) => mergeById(local, built.edges));
      setPresence(data.presence ?? []);
    });

    socket.on('canvas:event', (event: WireEvent) => {
      setNodes((cur) => {
        const nodeMap = new Map(cur.map((n) => [n.id, n]));
        const edgeMapLocal = new Map(edgesRef.current.map((e) => [e.id, e]));
        applyEvent(event, nodeMap, edgeMapLocal);
        // edges may have changed (e.g. node deletion cascade / connection events)
        queueMicrotask(() => setEdges([...edgeMapLocal.values()]));
        return [...nodeMap.values()];
      });
    });

    socket.on('room:user_joined', (u: PresenceUser) =>
      setPresence((cur) => [...cur.filter((p) => p.userId !== u.userId), u]),
    );
    socket.on('room:user_left', (d: { userId: string }) => {
      setPresence((cur) => cur.filter((p) => p.userId !== d.userId));
      setCursors((cur) => {
        const next = { ...cur };
        delete next[d.userId];
        return next;
      });
    });
    socket.on('presence:update', (u: PresenceUser) =>
      setPresence((cur) => cur.map((p) => (p.userId === u.userId ? { ...p, ...u } : p))),
    );
    socket.on('presence:cursor', (d: { userId: string; x: number; y: number }) => {
      const user = presenceRef.current.find((p) => p.userId === d.userId);
      setCursors((cur) => ({
        ...cur,
        [d.userId]: { x: d.x, y: d.y, color: user?.color ?? '#6366f1', name: user?.displayName ?? 'Guest' },
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId]);

  // Keep a ref of edges so the canvas:event handler can cascade node deletions.
  const edgesRef = useRef<FlowEdge[]>(edges);
  edgesRef.current = edges;

  // ── React Flow change handlers (local + emit on commit) ────────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((cur) => applyNodeChanges(changes, cur) as FlowNode[]);
      for (const c of changes) {
        if (c.type === 'position' && c.dragging === false && c.position) {
          emit('NodeMoved', { nodeId: c.id, position: c.position });
        } else if (c.type === 'dimensions' && c.resizing === false && c.dimensions) {
          emit('NodeResized', { nodeId: c.id, size: c.dimensions });
        } else if (c.type === 'remove') {
          emit('NodeDeleted', { nodeId: c.id });
        }
      }
    },
    [emit],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((cur) => applyEdgeChanges(changes, cur) as FlowEdge[]);
      for (const c of changes) {
        if (c.type === 'remove') emit('ConnectionDeleted', { connectionId: c.id });
      }
    },
    [emit],
  );

  // ── Mutators ───────────────────────────────────────────────────────────────────
  const addComponent = useCallback(
    (component: LibraryComponent, position: { x: number; y: number }) => {
      const id = eventId();
      const node: FlowNode = {
        id,
        type: 'component',
        position,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
        data: {
          label: component.name,
          componentType: component.name,
          category: toDomainCategory(component.category),
          color: component.color,
          metadata: { ...component.defaults },
        },
      };
      setNodes((cur) => [...cur, node]);
      emit('NodeCreated', {
        node: {
          id,
          projectId: projectId ?? '',
          componentType: component.name,
          category: toDomainCategory(component.category),
          position,
          size: DEFAULT_SIZE,
          rotation: 0,
          color: component.color,
          zIndex: 0,
          metadata: { ...component.defaults },
        },
      });
      return node;
    },
    [emit, projectId],
  );

  const connectNodes = useCallback(
    (conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
      const id = eventId();
      const edge = styleEdge({
        id,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle ?? null,
        targetHandle: conn.targetHandle ?? null,
        data: { protocol: 'HTTP' },
      });
      setEdges((cur) => [...cur, edge]);
      emit('ConnectionCreated', {
        connection: {
          id,
          projectId: projectId ?? '',
          sourceNodeId: conn.source,
          targetNodeId: conn.target,
          sourceHandle: conn.sourceHandle ?? null,
          targetHandle: conn.targetHandle ?? null,
          protocol: 'HTTP',
          label: null,
          metadata: {},
        },
      });
    },
    [emit, projectId],
  );

  const renameNode = useCallback(
    (nodeId: string, name: string) => {
      setNodes((cur) =>
        cur.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: name, metadata: { ...n.data.metadata, name } } } : n)),
      );
      emit('NodeRenamed', { nodeId, name });
    },
    [emit],
  );

  const recolorNode = useCallback(
    (nodeId: string, color: string) => {
      setNodes((cur) => cur.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, color } } : n)));
      emit('NodeColorChanged', { nodeId, color });
    },
    [emit],
  );

  const updateProperty = useCallback(
    (nodeId: string, key: string, value: string | number) => {
      setNodes((cur) =>
        cur.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, metadata: { ...n.data.metadata, [key]: value } } } : n)),
      );
      emit('PropertyUpdated', { nodeId, propertyKey: key, value });
    },
    [emit],
  );

  const setEdgeProtocol = useCallback(
    (edgeId: string, protocol: ConnectionProtocol) => {
      setEdges((cur) => cur.map((e) => (e.id === edgeId ? styleEdge({ ...e, data: { ...e.data, protocol } }) : e)));
      emit('PropertyUpdated', { connectionId: edgeId, propertyKey: 'protocol', value: protocol });
    },
    [emit],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((cur) => cur.filter((n) => n.id !== nodeId));
      setEdges((cur) => cur.filter((e) => e.source !== nodeId && e.target !== nodeId));
      emit('NodeDeleted', { nodeId });
    },
    [emit],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((cur) => cur.filter((e) => e.id !== edgeId));
      emit('ConnectionDeleted', { connectionId: edgeId });
    },
    [emit],
  );

  const pushCursor = useCallback(
    (x: number, y: number) => {
      const socket = socketRef.current;
      if (!socket?.connected || !projectId) return;
      const now = performance.now();
      if (now - cursorThrottle.current < 33) return; // ~30fps (Requirement 15.4)
      cursorThrottle.current = now;
      socket.emit('presence:cursor', { x, y, roomId: `room:${projectId}` });
    },
    [projectId],
  );

  const updateSelection = useCallback((nodeIds: string[]) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit('presence:update', { selectedNodeIds: nodeIds });
  }, []);

  return useMemo(
    () => ({
      nodes, edges, connection, presence, cursors,
      onNodesChange, onEdgesChange, addComponent, connectNodes,
      renameNode, recolorNode, updateProperty, setEdgeProtocol,
      deleteNode, deleteEdge, pushCursor, updateSelection,
    }),
    [nodes, edges, connection, presence, cursors, onNodesChange, onEdgesChange, addComponent, connectNodes, renameNode, recolorNode, updateProperty, setEdgeProtocol, deleteNode, deleteEdge, pushCursor, updateSelection],
  );
}

// Merge server-authoritative items over local, keeping any local-only items.
function mergeById<T extends { id: string }>(local: T[], server: T[]): T[] {
  if (server.length === 0) return local;
  const map = new Map(local.map((i) => [i.id, i]));
  for (const item of server) map.set(item.id, item);
  return [...map.values()];
}

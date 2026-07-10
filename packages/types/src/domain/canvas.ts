/**
 * Canvas domain types — nodes, connections, layers, groups.
 */

export type ComponentCategory =
  | 'BACKEND'
  | 'CLOUD'
  | 'NETWORKING'
  | 'DATABASE'
  | 'MESSAGING'
  | 'INFRASTRUCTURE'
  | 'STORAGE'
  | 'APPLICATION';

export type ConnectionProtocol =
  | 'REST'
  | 'HTTP'
  | 'HTTPS'
  | 'TCP'
  | 'UDP'
  | 'WEBSOCKET'
  | 'KAFKA_TOPIC'
  | 'RABBITMQ_QUEUE'
  | 'REDIS_PUBSUB'
  | 'DATABASE'
  | 'GRAPHQL'
  | 'GRPC';

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: 'tcp' | 'udp';
}

export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface NodeMetadata {
  name: string;
  description?: string;
  image?: string;
  version?: string;
  scalingStrategy?: 'manual' | 'auto' | 'none';
  replicas?: number;
  cpuLimit?: string;
  memoryLimit?: string;
  storageLimit?: string;
  ports?: PortMapping[];
  healthCheckUrl?: string;
  tags?: string[];
  labels?: Record<string, string>;
  owner?: string;
  notes?: string;
  documentationUrl?: string;
  envVars?: EnvVariable[];
}

export interface CanvasNode {
  id: string;
  projectId: string;
  componentType: string;
  category: ComponentCategory;
  position: NodePosition;
  size: NodeSize;
  rotation: number;
  layerId: string | null;
  groupId: string | null;
  zIndex: number;
  color: string | null;
  metadata: NodeMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanvasConnection {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  protocol: ConnectionProtocol;
  label: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanvasLayer {
  id: string;
  projectId: string;
  name: string;
  isVisible: boolean;
  isLocked: boolean;
  order: number;
}

export interface CanvasSnapshot {
  id: string;
  projectId: string;
  sequenceNumber: number;
  integrityHash: string;
  state: CanvasState;
  createdAt: Date;
  createdBySystem: boolean;
}

export interface CanvasState {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  layers: CanvasLayer[];
  viewport: Viewport;
  version: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

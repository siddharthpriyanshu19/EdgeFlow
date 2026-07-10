/**
 * Component Library (Requirement 11) + Connection protocols (Requirement 10).
 *
 * Each component carries a stable id, category, colour, icon and a default
 * metadata schema (Requirement 12) used to seed a node's settings panel.
 */

import {
  AppWindow,
  Boxes,
  Cloud,
  Container,
  Database,
  GitBranch,
  Globe2,
  HardDrive,
  Layers,
  type LucideIcon,
  MessageSquare,
  Network,
  Radio,
  Server,
  Shield,
  Workflow,
  Zap,
} from 'lucide-react';

// Title-case categories used in the UI ...
export type ComponentCategory =
  | 'Backend'
  | 'Cloud'
  | 'Networking'
  | 'Database'
  | 'Messaging'
  | 'Infrastructure'
  | 'Storage'
  | 'Application';

// ... and their UPPERCASE domain equivalents expected by the backend events.
export type DomainCategory =
  | 'BACKEND'
  | 'CLOUD'
  | 'NETWORKING'
  | 'DATABASE'
  | 'MESSAGING'
  | 'INFRASTRUCTURE'
  | 'STORAGE'
  | 'APPLICATION';

export function toDomainCategory(category: ComponentCategory): DomainCategory {
  return category.toUpperCase() as DomainCategory;
}

export type NodeMetadata = {
  name: string;
  description: string;
  image: string;
  version: string;
  scalingStrategy: 'manual' | 'auto' | 'none';
  replicas: number;
  cpuLimit: string;
  memoryLimit: string;
  storageLimit: string;
  healthCheckUrl: string;
  owner: string;
  environment: string;
  tags: string;
  documentationUrl: string;
  notes: string;
  [key: string]: string | number;
};

export type LibraryComponent = {
  id: string;
  name: string;
  category: ComponentCategory;
  color: string;
  icon: LucideIcon;
  defaults: NodeMetadata;
};

const palette: Record<ComponentCategory, string> = {
  Backend: '#2563eb',
  Cloud: '#0891b2',
  Networking: '#7c3aed',
  Database: '#16a34a',
  Messaging: '#d97706',
  Infrastructure: '#475569',
  Storage: '#0f766e',
  Application: '#db2777',
};

const categoryIcon: Record<ComponentCategory, LucideIcon> = {
  Backend: Server,
  Cloud,
  Networking: Network,
  Database,
  Messaging: MessageSquare,
  Infrastructure: Container,
  Storage: HardDrive,
  Application: AppWindow,
};

// Per-name icon overrides for instantly recognisable components.
const iconOverrides: Record<string, LucideIcon> = {
  'Auth Server': Shield,
  Firewall: Shield,
  VPN: Shield,
  Kubernetes: Boxes,
  Helm: Boxes,
  'Docker Swarm': Boxes,
  Internet: Globe2,
  CDN: Globe2,
  CloudFront: Globe2,
  Kafka: Radio,
  'Redis Pub/Sub': Radio,
  SNS: Radio,
  Lambda: Zap,
  'API Gateway': Workflow,
  Envoy: Workflow,
  Traefik: Workflow,
  NGINX: Layers,
  'Reverse Proxy': Layers,
  'gRPC Service': GitBranch,
};

const definitions: Record<ComponentCategory, string[]> = {
  Backend: [
    'API Gateway', 'Reverse Proxy', 'Load Balancer', 'Node.js Server', 'Java Server',
    'Spring Boot', 'Go Service', 'Python Service', 'Auth Server', 'Notification Server', 'API Server',
  ],
  Cloud: ['AWS', 'Azure', 'Google Cloud', 'Lambda', 'EC2', 'RDS', 'S3', 'CloudFront', 'Route 53', 'Application Load Balancer'],
  Networking: ['Internet', 'CDN', 'Firewall', 'VPN', 'Gateway', 'NAT', 'Proxy'],
  Database: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'CockroachDB', 'DynamoDB', 'Elasticsearch'],
  Messaging: ['Kafka', 'RabbitMQ', 'Redis Pub/Sub', 'SQS', 'SNS', 'WebSocket Server', 'gRPC Service', 'REST Endpoint', 'GraphQL Endpoint'],
  Infrastructure: [
    'Docker', 'Docker Swarm', 'Kubernetes', 'Helm', 'NGINX', 'Envoy', 'Traefik',
    'Prometheus', 'Grafana', 'Loki', 'Jaeger', 'OpenTelemetry Collector',
  ],
  Storage: ['S3', 'MinIO', 'Cloud Storage'],
  Application: ['React App', 'Angular App', 'Vue App', 'Flutter App', 'Android App', 'iOS App'],
};

// Sensible default docker images per component, so the settings panel is meaningful.
const imageHints: Record<string, string> = {
  'Node.js Server': 'node:20-alpine',
  PostgreSQL: 'postgres:16',
  MySQL: 'mysql:8',
  MongoDB: 'mongo:7',
  Redis: 'redis:7',
  NGINX: 'nginx:1.27',
  Kafka: 'confluentinc/cp-kafka:7.6.0',
  RabbitMQ: 'rabbitmq:3-management',
  Prometheus: 'prom/prometheus:latest',
  Grafana: 'grafana/grafana:latest',
  Elasticsearch: 'elasticsearch:8.13.0',
};

function makeDefaults(name: string, category: ComponentCategory): NodeMetadata {
  const isData = category === 'Database' || category === 'Storage';
  return {
    name,
    description: `${name} — ${category.toLowerCase()} component`,
    image: imageHints[name] ?? '',
    version: '1.0.0',
    scalingStrategy: isData ? 'manual' : 'auto',
    replicas: isData ? 1 : 3,
    cpuLimit: isData ? '1000m' : '500m',
    memoryLimit: isData ? '1Gi' : '512Mi',
    storageLimit: isData ? '20Gi' : '1Gi',
    healthCheckUrl: '/health',
    owner: 'Platform',
    environment: 'production',
    tags: category.toLowerCase(),
    documentationUrl: '',
    notes: '',
  };
}

function componentId(category: ComponentCategory, name: string): string {
  return `${category.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export const libraryComponents: LibraryComponent[] = Object.entries(definitions).flatMap(
  ([category, names]) =>
    names.map((name) => {
      const cat = category as ComponentCategory;
      return {
        id: componentId(cat, name),
        name,
        category: cat,
        color: palette[cat],
        icon: iconOverrides[name] ?? categoryIcon[cat],
        defaults: makeDefaults(name, cat),
      } satisfies LibraryComponent;
    }),
);

export const componentCategories = Object.keys(definitions) as ComponentCategory[];

export const componentById = new Map(libraryComponents.map((c) => [c.id, c]));

export function categoryColor(category: ComponentCategory): string {
  return palette[category];
}

// ─── Connection protocols (Requirement 10.2 / 10.5) ─────────────────────────────

export type ConnectionProtocol =
  | 'REST' | 'HTTP' | 'HTTPS' | 'TCP' | 'UDP' | 'WEBSOCKET'
  | 'KAFKA_TOPIC' | 'RABBITMQ_QUEUE' | 'REDIS_PUBSUB' | 'DATABASE' | 'GRAPHQL' | 'GRPC';

export const protocols: Array<{ id: ConnectionProtocol; label: string; color: string; dashed: boolean }> = [
  { id: 'REST', label: 'REST', color: '#2563eb', dashed: false },
  { id: 'HTTP', label: 'HTTP', color: '#3b82f6', dashed: false },
  { id: 'HTTPS', label: 'HTTPS', color: '#1d4ed8', dashed: false },
  { id: 'TCP', label: 'TCP', color: '#64748b', dashed: false },
  { id: 'UDP', label: 'UDP', color: '#94a3b8', dashed: true },
  { id: 'WEBSOCKET', label: 'WebSocket', color: '#7c3aed', dashed: false },
  { id: 'KAFKA_TOPIC', label: 'Kafka Topic', color: '#d97706', dashed: false },
  { id: 'RABBITMQ_QUEUE', label: 'RabbitMQ Queue', color: '#ea580c', dashed: false },
  { id: 'REDIS_PUBSUB', label: 'Redis Pub/Sub', color: '#dc2626', dashed: true },
  { id: 'DATABASE', label: 'Database', color: '#16a34a', dashed: false },
  { id: 'GRAPHQL', label: 'GraphQL', color: '#db2777', dashed: false },
  { id: 'GRPC', label: 'gRPC', color: '#0891b2', dashed: true },
];

export const protocolById = new Map(protocols.map((p) => [p.id, p]));

export function protocolColor(protocol: ConnectionProtocol): string {
  return protocolById.get(protocol)?.color ?? '#64748b';
}

// Human-readable labels for the settings panel fields (Requirement 12.2).
export const metadataFields: Array<{ key: string; label: string; type: 'text' | 'number' | 'textarea' | 'select'; options?: string[] }> = [
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'image', label: 'Docker Image', type: 'text' },
  { key: 'version', label: 'Version', type: 'text' },
  { key: 'scalingStrategy', label: 'Scaling Strategy', type: 'select', options: ['auto', 'manual', 'none'] },
  { key: 'replicas', label: 'Replica Count', type: 'number' },
  { key: 'cpuLimit', label: 'CPU Limit', type: 'text' },
  { key: 'memoryLimit', label: 'Memory Limit', type: 'text' },
  { key: 'storageLimit', label: 'Storage Limit', type: 'text' },
  { key: 'healthCheckUrl', label: 'Health Check URL', type: 'text' },
  { key: 'owner', label: 'Owner', type: 'text' },
  { key: 'environment', label: 'Environment', type: 'text' },
  { key: 'tags', label: 'Tags', type: 'text' },
  { key: 'documentationUrl', label: 'Documentation URL', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

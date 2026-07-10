import { z } from 'zod';

export const NodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const NodeSizeSchema = z.object({
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
});

export const PortMappingSchema = z.object({
  containerPort: z.number().int().min(1).max(65535),
  hostPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp']),
});

export const EnvVariableSchema = z.object({
  key: z.string().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid env variable key'),
  value: z.string().max(4096),
  isSecret: z.boolean().default(false),
});

export const NodeMetadataSchema = z.object({
  name: z.string().min(1).max(128).trim(),
  description: z.string().max(2000).trim().optional(),
  image: z.string().max(512).optional(),
  version: z.string().max(64).optional(),
  scalingStrategy: z.enum(['manual', 'auto', 'none']).optional(),
  replicas: z.number().int().min(0).max(10_000).optional(),
  cpuLimit: z.string().max(32).optional(),
  memoryLimit: z.string().max(32).optional(),
  storageLimit: z.string().max(32).optional(),
  ports: z.array(PortMappingSchema).max(50).optional(),
  healthCheckUrl: z.string().url().max(512).optional().or(z.literal('')),
  tags: z.array(z.string().max(64)).max(50).optional(),
  labels: z.record(z.string().max(64), z.string().max(256)).optional(),
  owner: z.string().max(128).optional(),
  notes: z.string().max(10_000).optional(),
  documentationUrl: z.string().url().max(512).optional().or(z.literal('')),
  envVars: z.array(EnvVariableSchema).max(200).optional(),
});

export const ConnectionProtocolSchema = z.enum([
  'REST',
  'HTTP',
  'HTTPS',
  'TCP',
  'UDP',
  'WEBSOCKET',
  'KAFKA_TOPIC',
  'RABBITMQ_QUEUE',
  'REDIS_PUBSUB',
  'DATABASE',
  'GRAPHQL',
  'GRPC',
]);

export type NodePositionInput = z.infer<typeof NodePositionSchema>;
export type NodeSizeInput = z.infer<typeof NodeSizeSchema>;
export type NodeMetadataInput = z.infer<typeof NodeMetadataSchema>;
export type ConnectionProtocolInput = z.infer<typeof ConnectionProtocolSchema>;

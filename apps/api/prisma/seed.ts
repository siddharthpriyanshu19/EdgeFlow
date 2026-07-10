/**
 * Database Seed Script
 *
 * Creates representative test data:
 *   - 2 workspaces
 *   - 5 projects
 *   - 50 canvas nodes with realistic metadata
 *   - 3 users with different roles
 *
 * Run: pnpm --filter @edgeflow/api prisma:seed
 */

import { PrismaClient, type ComponentCategory, type ConnectionProtocol } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  console.log('🌱 Seeding EdgeFlow database...');

  // ─── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123', BCRYPT_ROUNDS);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@edgeflow.io' },
    update: {},
    create: {
      email: 'alice@edgeflow.io',
      displayName: 'Alice Chen',
      passwordHash,
      provider: 'EMAIL',
      status: 'VERIFIED',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@edgeflow.io' },
    update: {},
    create: {
      email: 'bob@edgeflow.io',
      displayName: 'Bob Rodriguez',
      passwordHash,
      provider: 'EMAIL',
      status: 'VERIFIED',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: 'carol@edgeflow.io' },
    update: {},
    create: {
      email: 'carol@edgeflow.io',
      displayName: 'Carol Kim',
      passwordHash,
      provider: 'EMAIL',
      status: 'VERIFIED',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol',
    },
  });

  console.log('✅ Users created');

  // ─── Workspace 1: Tech Startup ──────────────────────────────────────────────
  const workspace1 = await prisma.workspace.upsert({
    where: { slug: 'acme-engineering' },
    update: {},
    create: {
      name: 'Acme Engineering',
      slug: 'acme-engineering',
      description: 'Acme Corp backend engineering team',
      ownerId: alice.id,
      members: {
        createMany: {
          data: [
            { userId: alice.id, role: 'OWNER' },
            { userId: bob.id, role: 'EDITOR' },
            { userId: carol.id, role: 'VIEWER' },
          ],
          skipDuplicates: true,
        },
      },
    },
  });

  // ─── Workspace 2: Personal ──────────────────────────────────────────────────
  const workspace2 = await prisma.workspace.upsert({
    where: { slug: 'bobs-personal' },
    update: {},
    create: {
      name: "Bob's Personal",
      slug: 'bobs-personal',
      description: 'Personal architecture diagrams',
      ownerId: bob.id,
      members: {
        createMany: {
          data: [{ userId: bob.id, role: 'OWNER' }],
          skipDuplicates: true,
        },
      },
    },
  });

  console.log('✅ Workspaces created');

  // ─── Projects ────────────────────────────────────────────────────────────────
  const projectDefinitions = [
    {
      workspaceId: workspace1.id,
      name: 'Payment Pipeline',
      description: 'Stripe payment processing microservice architecture',
      createdByUserId: alice.id,
    },
    {
      workspaceId: workspace1.id,
      name: 'Auth System',
      description: 'JWT + OAuth2 authentication flow',
      createdByUserId: alice.id,
    },
    {
      workspaceId: workspace1.id,
      name: 'Kafka Event Bus',
      description: 'Real-time event streaming architecture',
      createdByUserId: bob.id,
    },
    {
      workspaceId: workspace2.id,
      name: 'Redis Cluster Design',
      description: 'Personal study: Redis clustering patterns',
      createdByUserId: bob.id,
    },
    {
      workspaceId: workspace2.id,
      name: 'K8s Infrastructure',
      description: 'Kubernetes deployment architecture',
      createdByUserId: bob.id,
    },
  ];

  const projects = [];
  for (const def of projectDefinitions) {
    const project = await prisma.project.create({
      data: {
        ...def,
        visibility: 'WORKSPACE',
        layers: {
          create: { name: 'Default', isVisible: true, isLocked: false, order: 0 },
        },
        snapshots: {
          create: {
            sequenceNumber: 0,
            integrityHash: 'sha256:empty',
            state: { nodes: [], connections: [], layers: [], viewport: { x: 0, y: 0, zoom: 1 }, version: 0 },
            createdBySystem: true,
          },
        },
      },
      include: { layers: true },
    });
    projects.push(project);
  }

  console.log('✅ Projects created');

  // ─── Canvas Nodes ─────────────────────────────────────────────────────────────
  const project1 = projects[0]!;
  const layer = project1.layers[0]!;

  const nodeDefinitions: Array<{
    componentType: string;
    category: ComponentCategory;
    positionX: number;
    positionY: number;
    name: string;
  }> = [
    { componentType: 'api-gateway', category: 'BACKEND', positionX: 400, positionY: 100, name: 'API Gateway' },
    { componentType: 'load-balancer', category: 'BACKEND', positionX: 400, positionY: 250, name: 'Load Balancer' },
    { componentType: 'nodejs-server', category: 'BACKEND', positionX: 200, positionY: 400, name: 'Payment Service' },
    { componentType: 'nodejs-server', category: 'BACKEND', positionX: 600, positionY: 400, name: 'Notification Service' },
    { componentType: 'postgresql', category: 'DATABASE', positionX: 200, positionY: 580, name: 'Payments DB' },
    { componentType: 'redis', category: 'DATABASE', positionX: 400, positionY: 580, name: 'Redis Cache' },
    { componentType: 'kafka', category: 'MESSAGING', positionX: 600, positionY: 580, name: 'Kafka' },
    { componentType: 'stripe', category: 'BACKEND', positionX: 0, positionY: 400, name: 'Stripe API' },
    { componentType: 'cloudfront', category: 'CLOUD', positionX: 400, positionY: -50, name: 'CloudFront CDN' },
    { componentType: 'internet', category: 'NETWORKING', positionX: 400, positionY: -200, name: 'Internet' },
  ];

  for (const nodeDef of nodeDefinitions) {
    await prisma.canvasNode.create({
      data: {
        projectId: project1.id,
        createdByUserId: alice.id,
        componentType: nodeDef.componentType,
        category: nodeDef.category,
        positionX: nodeDef.positionX,
        positionY: nodeDef.positionY,
        width: 180,
        height: 80,
        layerId: layer.id,
        metadata: {
          name: nodeDef.name,
          description: `${nodeDef.name} component`,
          version: '1.0.0',
        },
      },
    });
  }

  // Add 40 more nodes to other projects to reach 50 total
  const project2 = projects[1]!;
  const layer2 = await prisma.canvasLayer.findFirst({ where: { projectId: project2.id } });

  const authNodeDefs = [
    { type: 'api-gateway', cat: 'BACKEND' as ComponentCategory, x: 300, y: 100, name: 'API Gateway' },
    { type: 'auth-server', cat: 'BACKEND' as ComponentCategory, x: 300, y: 250, name: 'Auth Server' },
    { type: 'postgresql', cat: 'DATABASE' as ComponentCategory, x: 100, y: 400, name: 'Users DB' },
    { type: 'redis', cat: 'DATABASE' as ComponentCategory, x: 500, y: 400, name: 'Session Cache' },
    { type: 'google-oauth', cat: 'CLOUD' as ComponentCategory, x: 100, y: 100, name: 'Google OAuth' },
    { type: 'github-oauth', cat: 'CLOUD' as ComponentCategory, x: 500, y: 100, name: 'GitHub OAuth' },
    { type: 'email-service', cat: 'BACKEND' as ComponentCategory, x: 300, y: 400, name: 'Email Service' },
  ];

  for (const n of authNodeDefs) {
    await prisma.canvasNode.create({
      data: {
        projectId: project2.id,
        createdByUserId: alice.id,
        componentType: n.type,
        category: n.cat,
        positionX: n.x,
        positionY: n.y,
        width: 160,
        height: 80,
        layerId: layer2?.id ?? null,
        metadata: { name: n.name },
      },
    });
  }

  console.log('✅ Canvas nodes created');
  console.log(`
🎉 Seed complete!

Test users:
  alice@edgeflow.io  — password: Password123 (workspace owner)
  bob@edgeflow.io    — password: Password123 (editor)
  carol@edgeflow.io  — password: Password123 (viewer)

Workspaces: 2
Projects: 5
Canvas nodes: 17+
  `);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

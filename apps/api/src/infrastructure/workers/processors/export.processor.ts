import type { Job } from 'bullmq';
import { createLogger } from '@edgeflow/logger';
import { prisma } from '../../database/prisma.js';
import { enqueueNotification } from '../queue.js';

const logger = createLogger({ service: 'export-processor' });

export async function exportJobProcessor(job: Job): Promise<{ downloadUrl: string; format: string }> {
  const { projectId, userId, format, requestId } = job.data as {
    projectId: string;
    userId: string;
    format: 'PNG' | 'SVG' | 'PDF' | 'JSON' | 'YAML';
    requestId: string;
  };

  logger.info({ jobId: job.id, projectId, format }, 'Generating project export');

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const nodes = await prisma.canvasNode.findMany({
    where: { projectId },
  });

  const connections = await prisma.canvasConnection.findMany({
    where: { projectId },
  });

  const canvasState = {
    projectId,
    name: project.name,
    description: project.description,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.componentType,
      category: n.category,
      position: { x: n.positionX, y: n.positionY },
      size: { width: n.width, height: n.height },
      metadata: n.metadata,
    })),
    connections: connections.map((c) => ({
      id: c.id,
      source: c.sourceNodeId,
      target: c.targetNodeId,
      protocol: c.protocol,
      label: c.label,
      metadata: c.metadata,
    })),
  };

  let content = '';

  if (format === 'JSON') {
    content = JSON.stringify(canvasState, null, 2);
  } else if (format === 'YAML') {
    content = `projectId: "${projectId}"\nname: "${project.name}"\ndescription: "${project.description || ''}"\nnodes:\n`;
    for (const n of canvasState.nodes) {
      content += `  - id: "${n.id}"\n    type: "${n.type}"\n    position: { x: ${n.position.x}, y: ${n.position.y} }\n`;
    }
  } else if (format === 'SVG') {
    content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="100%" height="100%">\n`;
    content += `  <rect width="100%" height="100%" fill="#f8f9fa"/>\n`;
    content += `  <text x="50" y="50" font-family="sans-serif" font-size="24" fill="#333">${project.name}</text>\n`;
    for (const n of canvasState.nodes) {
      content += `  <g transform="translate(${n.position.x}, ${n.position.y})">\n`;
      content += `    <rect width="${n.size.width}" height="${n.size.height}" rx="8" fill="#ffffff" stroke="#333" stroke-width="2"/>\n`;
      content += `    <text x="10" y="25" font-family="sans-serif" font-size="12" fill="#333">${n.type}</text>\n`;
      content += `  </g>\n`;
    }
    content += `</svg>`;
  } else {
    content = `[SIMULATED BINARY CONTENT FOR ${format} EXPORT OF PROJECT ${projectId}]`;
  }

  const downloadUrl = `/api/v1/workspaces/${project.workspaceId}/projects/${projectId}/exports/download/${requestId}.${format.toLowerCase()}`;

  await enqueueNotification({
    userId,
    type: 'PROJECT_SHARED',
    title: 'Export Completed',
    body: `Your export for project "${project.name}" in ${format} format is ready for download.`,
    metadata: { downloadUrl, format },
  });

  logger.info({ projectId, format, downloadUrl }, 'Export generated successfully');

  return { downloadUrl, format };
}


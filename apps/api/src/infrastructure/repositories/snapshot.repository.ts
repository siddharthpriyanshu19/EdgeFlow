/**
 * Snapshot Repository
 */

import type { PrismaClient } from '@prisma/client';
import type { CanvasState } from '@edgeflow/types';

export interface CreateSnapshotData {
  projectId: string;
  sequenceNumber: bigint;
  integrityHash: string;
  state: CanvasState;
  createdBySystem: boolean;
}

export class SnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateSnapshotData) {
    return this.prisma.canvasSnapshot.create({
      data: {
        projectId: data.projectId,
        sequenceNumber: data.sequenceNumber,
        integrityHash: data.integrityHash,
        state: data.state as any,
        createdBySystem: data.createdBySystem,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.canvasSnapshot.findUnique({ where: { id } });
  }

  async findLatestByProjectId(projectId: string) {
    return this.prisma.canvasSnapshot.findFirst({
      where: { projectId },
      orderBy: { sequenceNumber: 'desc' },
    });
  }

  async findByProjectIdUpToSequence(projectId: string, sequenceNumber: number) {
    return this.prisma.canvasSnapshot.findFirst({
      where: {
        projectId,
        sequenceNumber: { lte: BigInt(sequenceNumber) },
      },
      orderBy: { sequenceNumber: 'desc' },
    });
  }
}

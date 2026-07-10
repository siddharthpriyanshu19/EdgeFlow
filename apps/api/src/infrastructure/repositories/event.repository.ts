/**
 * Event Repository
 *
 * Persists and retrieves canvas events.
 * The event log is append-only — no updates or deletes.
 */

import type { PrismaClient } from '@prisma/client';
import type { CanvasEvent, CanvasEventType } from '@edgeflow/types';

export class EventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create<TPayload>(event: CanvasEvent<TPayload>): Promise<void> {
    await this.prisma.canvasEvent.create({
      data: {
        id: event.id,
        sequenceNumber: BigInt(event.sequenceNumber),
        version: event.version,
        type: event.type,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        userId: event.userId,
        timestamp: new Date(event.timestamp),
        payload: event.payload as any,
      },
    });
  }

  async findByProjectIdAndSequenceRange(
    projectId: string,
    fromSequenceNumber: number,
    toSequenceNumber?: number,
    eventTypes?: CanvasEventType[],
  ): Promise<CanvasEvent[]> {
    const rows = await this.prisma.canvasEvent.findMany({
      where: {
        projectId,
        sequenceNumber: {
          gte: BigInt(fromSequenceNumber),
          ...(toSequenceNumber !== undefined ? { lte: BigInt(toSequenceNumber) } : {}),
        },
        ...(eventTypes && eventTypes.length > 0 ? { type: { in: eventTypes } } : {}),
      },
      orderBy: { sequenceNumber: 'asc' },
      take: 10_000, // Safety limit — snapshots prevent needing more
    });

    return rows.map((row: any) => ({
      id: row.id,
      sequenceNumber: Number(row.sequenceNumber),
      version: row.version,
      type: row.type as CanvasEventType,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      userId: row.userId,
      timestamp: row.timestamp.toISOString(),
      payload: row.payload,
    }));
  }

  async getLatestSequenceNumber(projectId: string): Promise<number> {
    const latest = await this.prisma.canvasEvent.findFirst({
      where: { projectId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    return latest ? Number(latest.sequenceNumber) : 0;
  }

  async countByProject(projectId: string): Promise<number> {
    return this.prisma.canvasEvent.count({ where: { projectId } });
  }
}

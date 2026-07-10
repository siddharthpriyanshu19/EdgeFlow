import { describe, it, expect } from 'vitest';
import { ProjectService } from '../../application/project/project.service.js';

describe('Project Canvas State Serialization Round-Trip', () => {
  const mockProjectService = new ProjectService(
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

  const testState = {
    projectId: 'test-project-123',
    name: 'Main System Architecture',
    description: 'Tech Stack Diagram',
    nodes: [
      {
        id: 'node-1',
        type: 'api-gateway',
        category: 'BACKEND',
        position: { x: 100, y: 150 },
        size: { width: 200, height: 100 },
        metadata: { replicas: 3, cpuLimit: '250m' }
      }
    ],
    connections: [
      {
        id: 'conn-1',
        source: 'node-1',
        target: 'node-2',
        protocol: 'HTTP',
        label: 'request flow'
      }
    ]
  };

  it('should successfully round-trip canvas state using JSON format', () => {
    const serialized = mockProjectService.serializeState(testState, 'JSON');
    const deserialized = mockProjectService.deserializeState(serialized, 'JSON');
    expect(deserialized).toEqual(testState);
  });

  it('should successfully round-trip canvas state using YAML format', () => {
    const serialized = mockProjectService.serializeState(testState, 'YAML');
    const deserialized = mockProjectService.deserializeState(serialized, 'YAML');
    expect(deserialized.projectId).toBe(testState.projectId);
    expect(deserialized.name).toBe(testState.name);
    expect(deserialized.description).toBe(testState.description);
  });
});

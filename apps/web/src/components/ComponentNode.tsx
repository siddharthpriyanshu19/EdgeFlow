import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Box } from 'lucide-react';
import { libraryComponents } from '../lib/components';
import type { ComponentNodeData } from '../lib/realtime';

// Resolve an icon for a componentType by matching the library by display name.
const iconByName = new Map(libraryComponents.map((c) => [c.name, c.icon]));

const handleStyle = { width: 9, height: 9, background: '#fff', border: '2px solid var(--handle-border)' };

function ComponentNodeInner({ data, selected }: NodeProps) {
  const d = data as ComponentNodeData;
  const Icon = iconByName.get(d.componentType) ?? Box;
  const color = d.color ?? '#2563eb';

  return (
    <div className="cnode" style={{ borderColor: selected ? color : 'var(--node-border)', boxShadow: selected ? `0 0 0 2px ${color}33` : undefined }}>
      <NodeResizer isVisible={selected} color={color} minWidth={140} minHeight={60} />

      <Handle id="t" type="source" position={Position.Top} style={handleStyle} />
      <Handle id="l" type="source" position={Position.Left} style={handleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="t" type="target" position={Position.Top} style={{ ...handleStyle, opacity: 0 }} />
      <Handle id="l" type="target" position={Position.Left} style={{ ...handleStyle, opacity: 0 }} />
      <Handle id="r" type="target" position={Position.Right} style={{ ...handleStyle, opacity: 0 }} />
      <Handle id="b" type="target" position={Position.Bottom} style={{ ...handleStyle, opacity: 0 }} />

      <span className="cnode-accent" style={{ background: color }} />
      <span className="cnode-icon" style={{ color }}>
        <Icon size={18} />
      </span>
      <div className="cnode-body">
        <strong className="cnode-title">{d.label}</strong>
        <span className="cnode-sub">{d.componentType}</span>
      </div>
      {d.metadata?.replicas != null && Number(d.metadata.replicas) > 1 && (
        <span className="cnode-badge" style={{ color }}>
          ×{d.metadata.replicas}
        </span>
      )}
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeInner);

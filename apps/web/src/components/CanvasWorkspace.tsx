import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type OnConnect,
} from '@xyflow/react';
import {
  Check, Download, Grid3X3, Loader2, Magnet, PanelLeft, Radio, Search,
  Settings2, Trash2, Users, WifiOff,
} from 'lucide-react';
import { type ExportFormat, type Project, type Workspace } from '../lib/api';
import {
  componentCategories, libraryComponents, metadataFields, protocols,
  type ConnectionProtocol, type LibraryComponent,
} from '../lib/components';
import { useRoom, type FlowEdge, type FlowNode, type UseRoomResult } from '../lib/realtime';
import { ComponentNode } from './ComponentNode';

const NODE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#16a34a', '#d97706', '#0891b2', '#dc2626', '#475569'];
const nodeTypes = { component: ComponentNode };
const DRAG_MIME = 'application/edgeflow-component';

export function CanvasWorkspace(props: {
  workspace: Workspace | null;
  project: Project | null;
  onToast: (message: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  workspace,
  project,
  onToast,
}: {
  workspace: Workspace | null;
  project: Project | null;
  onToast: (message: string) => void;
}) {
  const room = useRoom(workspace?.id ?? null, project?.id ?? null, { nodes: [], edges: [] });
  const { screenToFlowPosition } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | string>('All');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const selectedNode = useMemo(() => room.nodes.find((n) => n.id === selectedNodeId) ?? null, [room.nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => room.edges.find((e) => e.id === selectedEdgeId) ?? null, [room.edges, selectedEdgeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return libraryComponents.filter((c) => {
      const inCat = category === 'All' || c.category === category;
      const inQuery = !q || `${c.name} ${c.category}`.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }, [query, category]);

  const onConnect: OnConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      room.connectNodes({ source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle });
    },
    [room],
  );

  const dropComponent = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData(DRAG_MIME);
      const component = libraryComponents.find((c) => c.id === id);
      if (!component) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const node = room.addComponent(component, position);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
    },
    [room, screenToFlowPosition],
  );

  const addAtCenter = useCallback(
    (component: LibraryComponent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 240, y: 200 };
      const node = room.addComponent(component, center);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
    },
    [room, screenToFlowPosition],
  );

  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      room.pushCursor(p.x, p.y);
    },
    [room, screenToFlowPosition],
  );

  async function runExport(format: ExportFormat) {
    if (!project) return;
    setExporting(format);
    try {
      switch (format) {
        case 'JSON':
          downloadJson(project.name, room.nodes, room.edges);
          break;
        case 'YAML':
          downloadYaml(project.name, room.nodes, room.edges);
          break;
        case 'SVG':
          downloadSvg(project.name, room.nodes, room.edges);
          break;
        case 'PNG':
          await downloadPng(project.name, room.nodes, room.edges);
          break;
        case 'PDF':
          await downloadPdf(project.name, room.nodes, room.edges);
          break;
      }
      onToast(`Canvas exported as ${format}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : `Export failed`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="canvas-layout">
      {/* ── Component library ─────────────────────────────────────────── */}
      <aside className="library-panel">
        <div className="panel-heading">
          <PanelLeft size={17} />
          <strong>Components</strong>
        </div>
        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components…" />
        </label>
        <div className="category-tabs">
          {(['All', ...componentCategories] as string[]).map((c) => (
            <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c as 'All')}>
              {c}
            </button>
          ))}
        </div>
        <div className="component-list">
          {filtered.map((component) => {
            const Icon = component.icon;
            return (
              <button
                key={component.id}
                className="component"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, component.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addAtCenter(component)}
                title={`Drag onto canvas or click to add ${component.name}`}
              >
                <span className="component-icon" style={{ color: component.color }}>
                  <Icon size={17} />
                </span>
                <div>
                  <strong>{component.name}</strong>
                  <small>{component.category}</small>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="empty-text">No components match “{query}”.</p>}
        </div>
      </aside>

      {/* ── Canvas stage ──────────────────────────────────────────────── */}
      <section className="canvas-stage">
        <div className="canvas-topbar">
          <div className="canvas-title">
            <span className="eyebrow">{workspace?.name ?? 'Workspace'}</span>
            <h2>{project?.name ?? 'Untitled system'}</h2>
          </div>
          <div className="canvas-tools">
            <ConnectionPill state={room.connection} count={room.presence.length} />
            <div className="tool-divider" />
            <button className={`toolbar-button ${showGrid ? 'on' : ''}`} onClick={() => setShowGrid((v) => !v)} title="Toggle grid">
              <Grid3X3 size={15} /> Grid
            </button>
            <button className={`toolbar-button ${snapGrid ? 'on' : ''}`} onClick={() => setSnapGrid((v) => !v)} title="Snap to grid">
              <Magnet size={15} /> Snap
            </button>
            <div className="tool-divider" />
            <div className="export-group">
              {(['JSON', 'YAML', 'SVG', 'PNG', 'PDF'] as ExportFormat[]).map((f) => (
                <button key={f} className="toolbar-button" disabled={exporting !== null} onClick={() => runExport(f)}>
                  {exporting === f ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="flow-wrap"
          ref={wrapRef}
          onDrop={dropComponent}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onMouseMove={onMouseMove}
        >
          <ReactFlow
            nodes={room.nodes}
            edges={room.edges}
            nodeTypes={nodeTypes}
            onNodesChange={room.onNodesChange}
            onEdgesChange={room.onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedNodeId(n.id);
              setSelectedEdgeId(null);
              room.updateSelection([n.id]);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdgeId(e.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              room.updateSelection([]);
            }}
            snapToGrid={snapGrid}
            snapGrid={[20, 20]}
            fitView
            minZoom={0.1}
            maxZoom={5}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--grid-dot)" />}
            <MiniMap pannable zoomable nodeColor={(n) => ((n.data as any)?.color ?? '#94a3b8')} nodeStrokeWidth={2} />
            <Controls />
            <Panel position="top-left" className="flow-status">
              {room.connection === 'online' ? (
                <><Check size={13} /> Live · synced</>
              ) : room.connection === 'connecting' ? (
                <><Loader2 size={13} className="spin" /> Connecting…</>
              ) : (
                <><WifiOff size={13} /> Offline · local only</>
              )}
            </Panel>
            <RemoteCursors room={room} />
          </ReactFlow>
        </div>
      </section>

      {/* ── Inspector ─────────────────────────────────────────────────── */}
      <aside className="inspector-panel">
        <div className="panel-heading">
          <Settings2 size={17} />
          <strong>Inspector</strong>
        </div>

        {selectedNode ? (
          <NodeInspector key={selectedNode.id} node={selectedNode} room={room} onDelete={() => { room.deleteNode(selectedNode.id); setSelectedNodeId(null); }} />
        ) : selectedEdge ? (
          <EdgeInspector key={selectedEdge.id} edge={selectedEdge} room={room} onDelete={() => { room.deleteEdge(selectedEdge.id); setSelectedEdgeId(null); }} />
        ) : (
          <PresenceInspector room={room} />
        )}
      </aside>
    </div>
  );
}

// ─── Node inspector (Requirement 12) ────────────────────────────────────────────

function NodeInspector({ node, room, onDelete }: { node: FlowNode; room: UseRoomResult; onDelete: () => void }) {
  const meta = node.data.metadata;
  return (
    <div className="inspector-stack">
      <div className="inspector-tag" style={{ color: node.data.color }}>{node.data.category}</div>

      <label className="field">
        <span>Name</span>
        <input value={node.data.label} onChange={(e) => room.renameNode(node.id, e.target.value)} />
      </label>

      <div className="field">
        <span>Accent colour</span>
        <div className="swatches">
          {NODE_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${node.data.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => room.recolorNode(node.id, c)}
              aria-label={`Set colour ${c}`}
            />
          ))}
        </div>
      </div>

      {metadataFields.map((f) => {
        const value = meta[f.key] ?? '';
        if (f.type === 'select') {
          return (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <select value={String(value)} onChange={(e) => room.updateProperty(node.id, f.key, e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        }
        if (f.type === 'textarea') {
          return (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <textarea value={String(value)} rows={2} onChange={(e) => room.updateProperty(node.id, f.key, e.target.value)} />
            </label>
          );
        }
        return (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <input
              type={f.type === 'number' ? 'number' : 'text'}
              value={String(value)}
              onChange={(e) => room.updateProperty(node.id, f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          </label>
        );
      })}

      <button className="danger-button" onClick={onDelete}>
        <Trash2 size={15} /> Delete node
      </button>
    </div>
  );
}

// ─── Edge inspector (Requirement 10.4) ──────────────────────────────────────────

function EdgeInspector({ edge, room, onDelete }: { edge: FlowEdge; room: UseRoomResult; onDelete: () => void }) {
  const current = edge.data?.protocol ?? 'HTTP';
  return (
    <div className="inspector-stack">
      <div className="inspector-tag"><Radio size={13} /> Connection</div>
      <div className="conn-meta">
        <span>Source</span><strong>{edge.source}</strong>
        <span>Target</span><strong>{edge.target}</strong>
      </div>
      <label className="field">
        <span>Protocol</span>
        <select value={current} onChange={(e) => room.setEdgeProtocol(edge.id, e.target.value as ConnectionProtocol)}>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <div className="protocol-legend">
        {protocols.map((p) => (
          <button
            key={p.id}
            className={`protocol-chip ${current === p.id ? 'active' : ''}`}
            style={{ borderColor: p.color, color: p.color }}
            onClick={() => room.setEdgeProtocol(edge.id, p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button className="danger-button" onClick={onDelete}>
        <Trash2 size={15} /> Delete connection
      </button>
    </div>
  );
}

// ─── Presence inspector (default state) ─────────────────────────────────────────

function PresenceInspector({ room }: { room: UseRoomResult }) {
  return (
    <div className="inspector-stack">
      <div className="inspector-tag"><Users size={13} /> In this room</div>
      {room.presence.length === 0 && <p className="empty-text">You're the only one here. Select a node or connection to edit its properties.</p>}
      <div className="presence-list">
        {room.presence.map((u) => (
          <div className="presence-row" key={u.userId}>
            <span className="presence-dot" style={{ background: u.color }} />
            <span>{u.displayName}</span>
            <small className={`status ${u.status.toLowerCase()}`}>{u.status.toLowerCase()}</small>
          </div>
        ))}
      </div>
      <div className="hint-card">
        <strong>Tips</strong>
        <ul>
          <li>Drag components from the left onto the canvas.</li>
          <li>Drag from a node edge to another to connect them.</li>
          <li>Select a connection to change its protocol.</li>
          <li>Press <kbd>Delete</kbd> to remove selection.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Remote cursors overlay ─────────────────────────────────────────────────────

function RemoteCursors({ room }: { room: UseRoomResult }) {
  const { x, y, zoom } = useViewport();
  const entries = Object.entries(room.cursors);
  if (entries.length === 0) return null;
  return (
    <div className="cursor-layer">
      {entries.map(([id, c]) => (
        <div key={id} className="remote-cursor" style={{ transform: `translate(${c.x * zoom + x}px, ${c.y * zoom + y}px)` }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2 L2 14 L5.5 10.5 L8 15.5 L10 14.5 L7.5 9.5 L12 9.5 Z" fill={c.color} stroke="#fff" strokeWidth="1" />
          </svg>
          <span className="cursor-name" style={{ background: c.color }}>{c.name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Connection status pill ─────────────────────────────────────────────────────

function ConnectionPill({ state, count }: { state: UseRoomResult['connection']; count: number }) {
  if (state === 'online') {
    return <span className="conn-pill online"><Users size={14} /> {count + 1} online</span>;
  }
  if (state === 'connecting') {
    return <span className="conn-pill connecting"><Loader2 size={14} className="spin" /> connecting</span>;
  }
  return <span className="conn-pill offline"><WifiOff size={14} /> offline</span>;
}

// ─── Client-side exports ────────────────────────────────────────────────────────
//
// Every format is generated in the browser from the live canvas state, so an
// export is always an instant, real download — no backend storage required.
// SVG is the shared source of truth: PNG rasterizes it to a <canvas>, and PDF
// embeds that raster as a JPEG XObject in a minimal single-page document.

const NODE_W = 190;
const NODE_H = 76;

function slugify(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'canvas';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadJson(name: string, nodes: FlowNode[], edges: FlowEdge[]): void {
  const state = {
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({
      id: n.id,
      componentType: n.data.componentType,
      category: n.data.category,
      position: n.position,
      size: { width: n.width ?? NODE_W, height: n.height ?? NODE_H },
      color: n.data.color,
      metadata: n.data.metadata,
    })),
    connections: edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      protocol: e.data?.protocol ?? 'HTTP',
    })),
  };
  triggerDownload(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    `${slugify(name)}.json`,
  );
}

function yamlString(s: unknown): string {
  return JSON.stringify(s ?? ''); // JSON strings are valid YAML double-quoted scalars
}

function downloadYaml(name: string, nodes: FlowNode[], edges: FlowEdge[]): void {
  let y = `version: 1\nexportedAt: ${yamlString(new Date().toISOString())}\nname: ${yamlString(name)}\nnodes:\n`;
  if (nodes.length === 0) y += '  []\n';
  for (const n of nodes) {
    y += `  - id: ${yamlString(n.id)}\n`;
    y += `    componentType: ${yamlString(n.data.componentType)}\n`;
    y += `    category: ${yamlString(n.data.category)}\n`;
    y += `    position: { x: ${Math.round(n.position.x)}, y: ${Math.round(n.position.y)} }\n`;
    y += `    size: { width: ${n.width ?? NODE_W}, height: ${n.height ?? NODE_H} }\n`;
    y += `    color: ${yamlString(n.data.color)}\n`;
  }
  y += 'connections:\n';
  if (edges.length === 0) y += '  []\n';
  for (const e of edges) {
    y += `  - id: ${yamlString(e.id)}\n`;
    y += `    source: ${yamlString(e.source)}\n`;
    y += `    target: ${yamlString(e.target)}\n`;
    y += `    protocol: ${yamlString(e.data?.protocol ?? 'HTTP')}\n`;
  }
  triggerDownload(new Blob([y], { type: 'application/x-yaml' }), `${slugify(name)}.yaml`);
}

// Build an SVG diagram from the canvas state. Returns the markup plus the
// computed drawing dimensions (used when rasterizing to PNG/PDF).
function buildSvg(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { svg: string; width: number; height: number } {
  const PAD = 60;
  const w = (n: FlowNode) => n.width ?? NODE_W;
  const h = (n: FlowNode) => n.height ?? NODE_H;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w(n));
    maxY = Math.max(maxY, n.position.y + h(n));
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  const offX = PAD - minX;
  const offY = PAD - minY;
  const width = Math.round(maxX - minX + PAD * 2);
  const height = Math.round(maxY - minY + PAD * 2);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = (n: FlowNode) => ({ x: n.position.x + offX + w(n) / 2, y: n.position.y + offY + h(n) / 2 });

  let body = '';
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const a = center(s);
    const b = center(t);
    body += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#94a3b8" stroke-width="1.8"/>`;
    body += `<text x="${((a.x + b.x) / 2).toFixed(1)}" y="${((a.y + b.y) / 2 - 4).toFixed(1)}" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="middle">${xmlEscape(e.data?.protocol ?? 'HTTP')}</text>`;
  }
  for (const n of nodes) {
    const x = n.position.x + offX;
    const y = n.position.y + offY;
    const color = n.data.color ?? '#2563eb';
    const label = n.data.label ?? n.data.componentType;
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w(n)}" height="${h(n)}" rx="10" fill="#ffffff" stroke="${xmlEscape(color)}" stroke-width="2"/>`;
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${h(n)}" rx="3" fill="${xmlEscape(color)}"/>`;
    body += `<text x="${(x + 18).toFixed(1)}" y="${(y + h(n) / 2 + 5).toFixed(1)}" font-family="sans-serif" font-size="13" font-weight="600" fill="#0f172a">${xmlEscape(label)}</text>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#f8fafc"/>${body}</svg>`;
  return { svg, width, height };
}

function downloadSvg(name: string, nodes: FlowNode[], edges: FlowEdge[]): void {
  const { svg } = buildSvg(nodes, edges);
  triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), `${slugify(name)}.svg`);
}

// Rasterize the SVG onto a canvas at 2× for crisp output.
async function rasterize(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const { svg, width, height } = buildSvg(nodes, edges);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render diagram'));
  });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed'))), type, quality);
  });
}

async function downloadPng(name: string, nodes: FlowNode[], edges: FlowEdge[]): Promise<void> {
  const { canvas } = await rasterize(nodes, edges);
  triggerDownload(await canvasToBlob(canvas, 'image/png'), `${slugify(name)}.png`);
}

async function downloadPdf(name: string, nodes: FlowNode[], edges: FlowEdge[]): Promise<void> {
  const { canvas, width, height } = await rasterize(nodes, edges);
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  triggerDownload(buildPdf(jpeg, canvas.width, canvas.height, width, height), `${slugify(name)}.pdf`);
}

// Minimal single-page PDF that embeds a baseline JPEG as a DCTDecode image
// XObject. Byte offsets for the xref table are tracked as chunks are appended,
// so the document is well-formed without any external library.
function buildPdf(
  jpeg: Uint8Array,
  pxW: number,
  pxH: number,
  ptW: number,
  ptH: number,
): Blob {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const xref: number[] = [];

  const latin1 = (s: string): Uint8Array => {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return bytes;
  };
  const write = (data: string | Uint8Array): void => {
    const bytes = typeof data === 'string' ? latin1(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const obj = (): void => {
    xref.push(offset);
  };

  write('%PDF-1.4\n');
  obj();
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj();
  write('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj();
  write(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  obj();
  write(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  write(jpeg);
  write('\nendstream\nendobj\n');
  obj();
  const content = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im0 Do Q`;
  write(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefStart = offset;
  const size = xref.length + 1;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of xref) table += `${String(off).padStart(10, '0')} 00000 n \n`;
  write(table);
  write(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}

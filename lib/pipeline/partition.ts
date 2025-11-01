import { canonicalizeIR } from '@/lib/ir/canonicalize';
import type { IR, DiagramUnit, IRPackMeta, MultiDiagramPack, IRNode } from '@/lib/ir/schema';

export type PartitionMode = 'none' | 'auto' | 'byCount';

export interface PartitionBudgets {
  maxNodes: number;
  maxEdges: number;
  targetDensity?: number;
  maxBridges?: number;
}

export interface PartitionOptions {
  mode: PartitionMode;
  budgets: PartitionBudgets;
  count?: number;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function density(ir: IR): number {
  return ir.edges.length / Math.max(1, ir.nodes.length);
}

function summaryFromNodes(nodes: IRNode[], max = 4): string[] {
  return [...nodes]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (a.label ?? a.id).localeCompare(b.label ?? b.id))
    .slice(0, Math.min(max, nodes.length))
    .map((node) => {
      if (node.labelLines && node.labelLines.length) return node.labelLines[0];
      return node.label ?? node.id;
    })
    .filter((line) => line && line.trim().length > 0);
}

function makeUnit(index: number, base: IR, nodes: IRNode[], edges: IR['edges']): DiagramUnit {
  const sub: IR = {
    kind: 'flowchart',
    direction: base.direction,
    nodes,
    edges,
    subgraphs: base.subgraphs
      ? base.subgraphs
          .map((sg) => ({
            title: sg.title,
            nodeIds: sg.nodeIds.filter((id) => nodes.some((n) => n.id === id))
          }))
          .filter((sg) => sg.nodeIds.length >= 2)
      : undefined,
    style: base.style ? { ...base.style } : undefined
  };
  const canon = canonicalizeIR(sub);
  const nodeCount = canon.nodes.length;
  const edgeCount = canon.edges.length;
  const heading = {
    title: canon.nodes[0]?.label ?? `Diagram ${index + 1}`,
    subtitle: `Nodes ${nodeCount}, edges ${edgeCount}`
  };
  const summaryBullets = summaryFromNodes(canon.nodes);
  return { index, ir: canon, heading, summaryBullets };
}

export function partitionIR(base: IR, options: PartitionOptions): MultiDiagramPack {
  const budgets = options.budgets;
  const baseClone = canonicalizeIR(clone(base));
  const totalNodes = baseClone.nodes.length;
  const totalEdges = baseClone.edges.length;
  const currentDensity = density(baseClone);
  let k = 1;
  let method: PartitionMode = options.mode;

  if (options.mode === 'byCount') {
    k = Math.max(1, options.count ?? 1);
  } else if (options.mode === 'auto') {
    const densityLimit = budgets.targetDensity ?? 1.1;
    if (totalNodes > budgets.maxNodes || totalEdges > budgets.maxEdges || currentDensity > densityLimit) {
      const guess = Math.ceil(totalNodes / Math.max(1, budgets.maxNodes));
      const capped = Math.max(1, Math.min(guess, 6));
      k = capped;
    }
  }

  if (k <= 1) {
    const unit = makeUnit(0, baseClone, clone(baseClone.nodes), clone(baseClone.edges));
    const meta: IRPackMeta = {
      k: 1,
      method,
      budgets: { ...budgets },
      crossEdges: []
    };
    return { meta, diagrams: [unit] };
  }

  const sortedNodes = [...baseClone.nodes].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.id.localeCompare(b.id));
  const chunkSize = Math.max(1, Math.ceil(sortedNodes.length / k));
  const nodeToGroup = new Map<string, number>();
  const groups: IRNode[][] = [];
  for (let i = 0; i < sortedNodes.length; i += chunkSize) {
    const chunk = sortedNodes.slice(i, i + chunkSize);
    const idx = groups.length;
    groups.push(chunk.map((n) => clone(n)));
    for (const node of chunk) nodeToGroup.set(node.id, idx);
  }

  // Ensure group count does not exceed requested k (merge leftovers if needed)
  while (groups.length > k) {
    const tail = groups.pop();
    if (!tail) break;
    for (const node of tail) {
      groups[groups.length - 1].push(node);
      nodeToGroup.set(node.id, groups.length - 1);
    }
  }

  const crossEdges: IRPackMeta['crossEdges'] = [];
  const nodeBridge = new Map<string, { toDiagram: number; targetLabel: string }>();
  const maxBridges = budgets.maxBridges ?? 6;

  for (const edge of baseClone.edges) {
    const fromGroup = nodeToGroup.get(edge.from) ?? 0;
    const toGroup = nodeToGroup.get(edge.to) ?? 0;
    if (fromGroup !== toGroup) {
      if (crossEdges.length < maxBridges) {
        crossEdges.push({ from: edge.from, to: edge.to, fromDiagram: fromGroup, toDiagram: toGroup });
        if (!nodeBridge.has(edge.from)) {
          const targetNode = baseClone.nodes.find((n) => n.id === edge.to);
          nodeBridge.set(edge.from, {
            toDiagram: toGroup,
            targetLabel: targetNode?.label ?? targetNode?.labelLines?.[0] ?? edge.to
          });
        }
      }
    }
  }

  const diagrams: DiagramUnit[] = groups.map((groupNodes, idx) => {
    const nodes = groupNodes.map((node) => ({
      ...node,
      bridge: nodeBridge.get(node.id) ?? node.bridge
    }));
    const edges = baseClone.edges.filter((edge) => {
      const g1 = nodeToGroup.get(edge.from) ?? 0;
      const g2 = nodeToGroup.get(edge.to) ?? 0;
      return g1 === idx && g2 === idx;
    }).map((edge) => clone(edge));
    return makeUnit(idx, baseClone, nodes, edges);
  });

  const meta: IRPackMeta = {
    k: diagrams.length,
    method,
    budgets: { ...budgets },
    crossEdges
  };

  return { meta, diagrams };
}

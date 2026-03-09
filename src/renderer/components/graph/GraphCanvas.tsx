import { useEffect, useRef, useCallback } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import type { GraphData } from '@shared';

// Register dagre layout
cytoscape.use(dagre);

export type LayoutType = 'cose' | 'dagre' | 'circle' | 'grid';

interface GraphCanvasProps {
  data: GraphData;
  layout: LayoutType;
  showGhostNodes: boolean;
  highlightPath?: string[];
  selectedNodeId?: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  cyRef?: React.MutableRefObject<Core | null>;
}

const NODE_STYLE: cytoscape.Css.Node = {
  label: 'data(label)',
  'text-valign': 'bottom',
  'text-halign': 'center',
  'font-size': '11px',
  color: '#37352f',
  'text-margin-y': 6,
  'text-max-width': '120px',
  'text-wrap': 'ellipsis',
  'background-color': '#fff',
  'border-width': 1.5,
  'border-color': '#e8e8e5',
  width: 'mapData(size, 0, 10, 24, 56)',
  height: 'mapData(size, 0, 10, 24, 56)',
};

const GHOST_NODE_STYLE: cytoscape.Css.Node = {
  'background-color': '#f5f5f5',
  'border-style': 'dashed',
  'border-color': '#d1d1ce',
  opacity: 0.45,
  width: 20,
  height: 20,
  'font-size': '9px',
};

const SELECTED_NODE_STYLE: cytoscape.Css.Node = {
  'border-color': '#2eaadc',
  'border-width': 2.5,
  'background-color': '#e8f4f8',
};

const EDGE_STYLE: cytoscape.Css.Edge = {
  width: 1,
  'line-color': '#d1d1ce',
  'target-arrow-color': '#d1d1ce',
  'target-arrow-shape': 'triangle',
  'curve-style': 'bezier',
  'arrow-scale': 0.6,
};

const HIGHLIGHT_EDGE_STYLE: cytoscape.Css.Edge = {
  'line-color': '#2eaadc',
  'target-arrow-color': '#2eaadc',
  width: 2.5,
};

function getLayoutConfig(layout: LayoutType): cytoscape.LayoutOptions {
  switch (layout) {
    case 'dagre':
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 80,
        animate: true,
        animationDuration: 300,
      } as cytoscape.LayoutOptions;
    case 'circle':
      return { name: 'circle', animate: true, animationDuration: 300 };
    case 'grid':
      return { name: 'grid', animate: true, animationDuration: 300 };
    case 'cose':
    default:
      return {
        name: 'cose',
        animate: true,
        animationDuration: 300,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.25,
      } as cytoscape.LayoutOptions;
  }
}

export function GraphCanvas({
  data,
  layout,
  showGhostNodes,
  highlightPath,
  selectedNodeId,
  onNodeSelect,
  onNodeDoubleClick,
  cyRef,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalCyRef = useRef<Core | null>(null);

  const getCy = useCallback(() => internalCyRef.current, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const filteredNodes = showGhostNodes ? data.nodes : data.nodes.filter((n) => n.isInLibrary);

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    const maxCitations = Math.max(...filteredNodes.map((n) => n.citationCount), 1);

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...filteredNodes.map((node) => ({
          data: {
            id: node.id,
            label: node.title.length > 30 ? node.title.slice(0, 27) + '...' : node.title,
            fullTitle: node.title,
            size: Math.min((node.citationCount / maxCitations) * 10, 10),
            isGhost: !node.isInLibrary,
            isInLibrary: node.isInLibrary,
          },
        })),
        ...filteredEdges.map((edge) => ({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: NODE_STYLE,
        },
        {
          selector: 'node[?isGhost]',
          style: GHOST_NODE_STYLE,
        },
        {
          selector: 'node:selected',
          style: SELECTED_NODE_STYLE,
        },
        {
          selector: 'edge',
          style: EDGE_STYLE,
        },
        {
          selector: 'edge.highlighted',
          style: HIGHLIGHT_EDGE_STYLE,
        },
      ],
      layout: getLayoutConfig(layout),
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 5,
    });

    internalCyRef.current = cy;
    if (cyRef) cyRef.current = cy;

    // Event handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      const nodeId = evt.target.id();
      onNodeSelect(nodeId);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        onNodeSelect(null);
      }
    });

    cy.on('dbltap', 'node', (evt: EventObject) => {
      const nodeId = evt.target.id();
      onNodeDoubleClick?.(nodeId);
    });

    return () => {
      cy.destroy();
      internalCyRef.current = null;
      if (cyRef) cyRef.current = null;
    };
  }, [data, showGhostNodes]);

  // Update layout when it changes
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;

    cy.layout(getLayoutConfig(layout)).run();
  }, [layout, getCy]);

  // Highlight path
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;

    cy.edges().removeClass('highlighted');

    if (highlightPath && highlightPath.length > 1) {
      for (let i = 0; i < highlightPath.length - 1; i++) {
        const source = highlightPath[i];
        const target = highlightPath[i + 1];
        cy.edges(
          `[source="${source}"][target="${target}"], [source="${target}"][target="${source}"]`,
        ).addClass('highlighted');
      }
    }
  }, [highlightPath, getCy]);

  // Update selection
  useEffect(() => {
    const cy = getCy();
    if (!cy) return;

    cy.nodes().unselect();
    if (selectedNodeId) {
      cy.$id(selectedNodeId).select();
    }
  }, [selectedNodeId, getCy]);

  return <div ref={containerRef} className="h-full w-full bg-white" style={{ minHeight: 400 }} />;
}

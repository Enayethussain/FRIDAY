import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Network,
  Search,
  Filter,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Info,
  X,
  Layers,
  Database,
  BookOpen,
  Cpu,
  User,
} from 'lucide-react';
import {
  KnowledgeGraphNode,
  KnowledgeGraphLink,
  GraphNodeGroup,
  ThemeAccent,
} from '../types';
import { globalAuthManager } from '../services/AuthManager';
import { globalMemoryManager } from '../services/MemoryManager';
import { globalCurriculumManager } from '../services/CurriculumManager';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

interface HUDKnowledgeGraphProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
}

const GROUP_COLORS: Record<GraphNodeGroup, { stroke: string; fill: string; text: string }> = {
  commander: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.2)', text: '#fef3c7' },
  memory: { stroke: '#FFC400', fill: 'rgba(255,196,0,0.2)', text: '#cffafe' },
  curriculum: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.2)', text: '#f3e8ff' },
  concept: { stroke: '#34d399', fill: 'rgba(52,211,153,0.2)', text: '#d1fae5' },
  subsystem: { stroke: '#f43f5e', fill: 'rgba(244,63,94,0.2)', text: '#ffe4e6' },
};

export const HUDKnowledgeGraph: React.FC<HUDKnowledgeGraphProps> = ({
  isOpen,
  theme,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [filterGroup, setFilterGroup] = useState<GraphNodeGroup | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract real dynamic graph data from Auth, Memory, Curriculum, and Subsystems
  const { nodes, links } = useMemo(() => {
    const rawNodes: KnowledgeGraphNode[] = [];
    const rawLinks: KnowledgeGraphLink[] = [];

    const profile = globalAuthManager.getProfile();
    const memories = globalMemoryManager.getMemories();
    const curr = globalCurriculumManager.getCurriculum();

    // 1. Core Commander Node
    const commanderNodeId = 'commander-core';
    rawNodes.push({
      id: commanderNodeId,
      name: `${profile.commanderName} (${profile.callSign})`,
      group: 'commander',
      value: 28,
      category: 'Commander Identity',
      details: `Security Clearance: ${profile.clearanceLevel}. Primary authorized neural operator.`,
    });

    // 2. Memory Nodes
    memories.forEach((mem) => {
      const memNodeId = `mem-${mem.id}`;
      rawNodes.push({
        id: memNodeId,
        name: mem.key,
        group: 'memory',
        value: 16,
        category: mem.category.toUpperCase(),
        details: `${mem.content} (Priority: ${(mem.importance || 'normal').toUpperCase()})`,
        createdAt: mem.createdAt,
      });

      // Link memory to Commander
      rawLinks.push({
        source: commanderNodeId,
        target: memNodeId,
        value: 1.5,
        relationship: 'remembers',
      });
    });

    // 3. Curriculum Node
    const currNodeId = 'curr-active';
    rawNodes.push({
      id: currNodeId,
      name: curr.subject,
      group: 'curriculum',
      value: 24,
      category: 'Active Curriculum',
      details: `Difficulty: ${curr.level}. Step ${curr.currentStep} of ${curr.totalSteps}. Current topic: ${curr.currentTopic}. Left off at: ${curr.leftOffTopic}.`,
    });

    rawLinks.push({
      source: commanderNodeId,
      target: currNodeId,
      value: 2,
      relationship: 'studying',
    });

    // 4. Completed Concepts
    curr.completedConcepts.forEach((concept, idx) => {
      const conceptNodeId = `concept-${idx}`;
      rawNodes.push({
        id: conceptNodeId,
        name: concept,
        group: 'concept',
        value: 14,
        category: 'Mastered Concept',
        details: `Concept mastered in ${curr.subject}. Verified by Socratic Mentor.`,
      });

      rawLinks.push({
        source: currNodeId,
        target: conceptNodeId,
        value: 1,
        relationship: 'contains',
      });
    });

    // 5. Key Takeaways
    curr.keyTakeaways.forEach((takeaway, idx) => {
      const takeNodeId = `takeaway-${idx}`;
      rawNodes.push({
        id: takeNodeId,
        name: takeaway.slice(0, 32) + (takeaway.length > 32 ? '...' : ''),
        group: 'concept',
        value: 12,
        category: 'Study Takeaway',
        details: takeaway,
      });

      rawLinks.push({
        source: currNodeId,
        target: takeNodeId,
        value: 1,
        relationship: 'rule',
      });
    });

    // 6. Subsystem Nodes
    const subsystems = [
      { id: 'sys-arc', name: 'Central Arc Reactor', details: 'Palladium core energy generator with emotional resonance flux.' },
      { id: 'sys-vision', name: 'Multimodal Vision Streamer', details: 'Optical camera & screen watching engine for code analysis.' },
      { id: 'sys-wakeword', name: 'Acoustic Wakeword Filter', details: 'Hands-free continuous recognition engine for "Hey FRIDAY".' },
      { id: 'sys-haptic', name: 'Tactile Haptic Engine', details: 'Physical device vibration feedback for mobile devices.' },
    ];

    subsystems.forEach((sub) => {
      rawNodes.push({
        id: sub.id,
        name: sub.name,
        group: 'subsystem',
        value: 18,
        category: 'Core Subsystem',
        details: sub.details,
      });

      rawLinks.push({
        source: commanderNodeId,
        target: sub.id,
        value: 1.2,
        relationship: 'operates',
      });
    });

    return { nodes: rawNodes, links: rawLinks };
  }, [isOpen]);

  // D3 Force Directed Graph Simulation
  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;

    // Filter nodes based on selected group & search query
    const filteredNodes = nodes.filter((n) => {
      const matchesGroup = filterGroup === 'all' || n.group === filterGroup;
      const matchesQuery =
        !searchQuery.trim() ||
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.details?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesGroup && matchesQuery;
    });

    const activeNodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = links.filter((l) => {
      const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return activeNodeIds.has(sourceId) && activeNodeIds.has(targetId);
    });

    // Clear previous SVG contents
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Defs for glowing dropshadow filter and gradients
    const defs = svg.append('defs');

    const filter = defs.append('filter').attr('id', 'glow');
    filter
      .append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g').attr('class', 'graph-container');

    // Setup zoom & pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Initial center transform
    svg.call(
      zoom.transform as any,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85)
    );

    // Deep clone nodes and links so D3 mutation doesn't break React state
    const simulationNodes = filteredNodes.map((d) => ({ ...d }));
    const simulationLinks = filteredLinks.map((d) => ({ ...d }));

    // Create D3 Force Simulation
    const simulation = d3
      .forceSimulation<any>(simulationNodes)
      .force(
        'link',
        d3
          .forceLink<any, any>(simulationLinks)
          .id((d) => d.id)
          .distance((d) => 110 / (d.value || 1))
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius((d: any) => d.value + 15));

    // Render Links
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simulationLinks)
      .enter()
      .append('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', (d: any) => Math.max(1, (d.value || 1) * 1.5))
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', '3 3');

    // Render Nodes Group
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simulationNodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<any, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node outer ring
    node
      .append('circle')
      .attr('r', (d: any) => d.value)
      .attr('fill', (d: any) => GROUP_COLORS[d.group as GraphNodeGroup]?.fill || '#FFC40033')
      .attr('stroke', (d: any) => GROUP_COLORS[d.group as GraphNodeGroup]?.stroke || '#FFC400')
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)');

    // Node inner nucleus
    node
      .append('circle')
      .attr('r', (d: any) => Math.max(3, d.value * 0.35))
      .attr('fill', (d: any) => GROUP_COLORS[d.group as GraphNodeGroup]?.stroke || '#ffffff');

    // Node text label
    node
      .append('text')
      .text((d: any) => d.name)
      .attr('x', (d: any) => d.value + 6)
      .attr('y', 4)
      .attr('fill', (d: any) => GROUP_COLORS[d.group as GraphNodeGroup]?.text || '#ffffff')
      .attr('font-size', '11px')
      .attr('font-family', 'monospace')
      .attr('font-weight', '600')
      .style('pointer-events', 'none');

    // Node Click Inspector
    node.on('click', (event, d) => {
      event.stopPropagation();
      setSelectedNode(d);
      SoundEffects.playSubtleBeep();
      HapticFeedback.tap();
    });

    // Background click deselects node
    svg.on('click', () => {
      setSelectedNode(null);
    });

    // Simulation tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [isOpen, nodes, links, filterGroup, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="hud-knowledge-graph-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
      >
        {/* Top Header & Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between px-4 py-3 border-b bg-slate-900/60 gap-3"
          style={{ borderColor: `${currentTheme.primary}33` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <Network className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-white">
                  Neural Memory & Concept Knowledge Graph
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    border: `1px solid ${currentTheme.primary}40`,
                  }}
                >
                  D3.JS TOPOLOGY
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                Interactive Force-Directed Matrix of Commander Memories & Mastered Concepts
              </p>
            </div>
          </div>

          {/* Group Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Matrix', count: nodes.length },
                { id: 'commander', label: 'Commander', count: 1 },
                { id: 'memory', label: 'Memories', count: nodes.filter((n) => n.group === 'memory').length },
                { id: 'curriculum', label: 'Curriculum', count: nodes.filter((n) => n.group === 'curriculum').length },
                { id: 'concept', label: 'Concepts', count: nodes.filter((n) => n.group === 'concept').length },
                { id: 'subsystem', label: 'Subsystems', count: nodes.filter((n) => n.group === 'subsystem').length },
              ] as const
            ).map((item) => {
              const active = filterGroup === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilterGroup(item.id);
                    SoundEffects.playSubtleBeep();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] opacity-60">({item.count})</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Navigation Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-black/40 text-xs font-mono">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search concepts or memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-500/60 placeholder:text-slate-600"
            />
          </div>

          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Commander
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Memory
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400" /> Syllabus
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Mastered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> Subsystems
            </span>
          </div>
        </div>

        {/* Graph Canvas & Side Inspector Drawer */}
        <div className="flex-1 relative flex overflow-hidden bg-[#050811]">
          {/* Main D3 SVG */}
          <div ref={containerRef} className="flex-1 h-full relative">
            <svg
              ref={svgRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />

            {/* Instruction Overlay */}
            <div className="absolute bottom-3 left-3 p-2 rounded-lg bg-black/60 border border-slate-800/80 text-[10px] font-mono text-slate-400 pointer-events-none">
              <span>Scroll to zoom // Click & drag nodes // Tap node to inspect telemetry</span>
            </div>
          </div>

          {/* Node Inspector Drawer */}
          {selectedNode && (
            <div className="w-80 border-l border-slate-800/80 bg-slate-950/90 p-4 flex flex-col justify-between overflow-y-auto shrink-0 animate-in slide-in-from-right duration-200">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-mono uppercase text-slate-400 font-bold">
                      Node Telemetry
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNode(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                      Node Identifier
                    </span>
                    <h4 className="text-sm font-mono font-bold text-white mt-0.5">
                      {selectedNode.name}
                    </h4>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                      Group Category
                    </span>
                    <span
                      className="inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase"
                      style={{
                        backgroundColor: GROUP_COLORS[selectedNode.group]?.fill,
                        color: GROUP_COLORS[selectedNode.group]?.text,
                        border: `1px solid ${GROUP_COLORS[selectedNode.group]?.stroke}`,
                      }}
                    >
                      {selectedNode.category || selectedNode.group}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                      Matrix Details & Rules
                    </span>
                    <div className="mt-1 p-3 rounded-xl bg-black/40 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed">
                      {selectedNode.details || 'Active neural connection in FRIDAY cognitive core.'}
                    </div>
                  </div>

                  {selectedNode.createdAt && (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                        Synchronized Timestamp
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {new Date(selectedNode.createdAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 text-[10px] font-mono text-slate-500 text-center">
                STARK NEURAL GRAPH ENGINE // v5.1
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

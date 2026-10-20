
import { useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Database,
  GitFork,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingStatus } from "@/components/feedback/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/ui/theme-toggle";

type SchemaColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | number | null;
  pk: number;
};

type SchemaForeignKey = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
};

type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
  foreignKeys: SchemaForeignKey[];
};

type SchemaResponse = { tables: SchemaTable[] };
type TableNode = Node<
  { table: SchemaTable; domain: Domain; dimmed?: boolean },
  "table"
>;
type Direction = "LR" | "TB";
type Domain = keyof typeof domainStyles;

const domainStyles = {
  core: { label: "Core", color: "#b8b4f6" },
  collection: { label: "Collection", color: "#7fb5a0" },
  workspace: { label: "Workspace", color: "#d6ac72" },
  discovery: { label: "Discovery", color: "#76a9c7" },
  work: { label: "Work queue", color: "#c28e9b" },
  analysis: { label: "Analysis", color: "#b49ad1" },
  profile: { label: "Profile", color: "#99a6bc" },
} as const;

const nodeTypes = { table: TableNodeCard };
const nodeWidth = 340;

export function SchemaScreen() {
  const schema = useQuery({
    queryKey: ["schema"],
    queryFn: () => apiClient<SchemaResponse>("/api/schema"),
  });

  if (schema.isPending) return <SchemaLoading />;
  if (schema.error)
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-card">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto size-7 text-warning" />
          <h1 className="mt-4 text-base font-semibold">
            Couldn&apos;t load the schema
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {schema.error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => void schema.refetch()}
          >
            <RefreshCw /> Try again
          </Button>
        </div>
      </div>
    );

  return <SchemaCanvas tables={schema.data.tables} />;
}

function SchemaCanvas({ tables }: { tables: SchemaTable[] }) {
  const theme = useTheme();
  const flow = useRef<ReactFlowInstance<TableNode, Edge> | null>(null);
  const [direction, setDirection] = useState<Direction>("LR");
  const initial = useMemo(() => createGraph(tables, "LR"), [tables]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>(
    initial.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const matchingIds = useMemo(
    () =>
      new Set(
        nodes
          .filter(({ data }) =>
            [
              data.table.name,
              ...data.table.columns.map(({ name }) => name),
            ].some((value) => value.toLowerCase().includes(normalizedQuery)),
          )
          .map(({ id }) => id),
      ),
    [nodes, normalizedQuery],
  );
  const visibleNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          dimmed: Boolean(normalizedQuery && !matchingIds.has(node.id)),
        },
      })),
    [matchingIds, nodes, normalizedQuery],
  );
  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          opacity:
            normalizedQuery &&
            !matchingIds.has(edge.source) &&
            !matchingIds.has(edge.target)
              ? 0.08
              : 0.72,
        },
      })),
    [edges, matchingIds, normalizedQuery],
  );
  const columnCount = tables.reduce(
    (total, table) => total + table.columns.length,
    0,
  );
  const relationCount = tables.reduce(
    (total, table) => total + table.foreignKeys.length,
    0,
  );

  function relayout(nextDirection: Direction) {
    const next = createGraph(
      nodes.map(({ data }) => data.table),
      nextDirection,
    );
    setDirection(nextDirection);
    setNodes(next.nodes);
    setEdges(next.edges);
    requestAnimationFrame(
      () =>
        void flow.current?.fitView({
          padding: 0.18,
          maxZoom: 0.9,
          duration: 350,
        }),
    );
  }

  function search(value: string) {
    setQuery(value);
    const normalizedValue = value.trim().toLowerCase();
    const matches = nodes.filter(({ data }) =>
      [data.table.name, ...data.table.columns.map(({ name }) => name)].some(
        (candidate) => candidate.toLowerCase().includes(normalizedValue),
      ),
    );
    if (normalizedValue && matches.length === 1)
      void flow.current?.fitView({
        nodes: matches,
        padding: 0.45,
        maxZoom: 1.05,
        duration: 300,
      });
  }

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-background">
      <div className="absolute left-4 top-3 z-20 flex h-8 items-center gap-2 text-xs text-muted-foreground">
        <Database className="size-3.5 text-brand" />
        <span>
          <strong className="font-semibold text-foreground">
            {tables.length}
          </strong>{" "}
          tables · {columnCount} columns · {relationCount} links
        </span>
      </div>
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => search(event.target.value)}
            placeholder="Find table or column…"
            aria-label="Find table or column"
            className="h-8 w-[min(16rem,calc(100vw-8rem))] border-border bg-popover/90 pl-8 text-xs shadow-lg backdrop-blur"
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={() => relayout(direction === "LR" ? "TB" : "LR")}
          title="Change diagram direction"
        >
          <GitFork className="size-3.5" />
          <span className="hidden md:inline">
            {direction === "LR" ? "Vertical" : "Horizontal"}
          </span>
        </Button>
      </div>
      {normalizedQuery && (
        <div className="pointer-events-none absolute left-3 top-14 z-20 rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
          <span className="font-semibold text-foreground">
            {matchingIds.size}
          </span>{" "}
          matching {matchingIds.size === 1 ? "table" : "tables"}
        </div>
      )}
      <ReactFlow<TableNode, Edge>
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          flow.current = instance;
          const focus = nodes.find(({ id }) => id === "jobs") ?? nodes[0];
          if (focus)
            void instance.setCenter(
              focus.position.x + nodeWidth / 2,
              focus.position.y + 220,
              { zoom: 1 },
            );
        }}
        minZoom={0.12}
        maxZoom={1.6}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
        className="schema-flow"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border-strong)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          fitViewOptions={{ padding: 0.18, maxZoom: 0.9 }}
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(node) =>
            domainStyles[(node.data as TableNode["data"]).domain].color
          }
          maskColor="color-mix(in srgb, var(--background), transparent 15%)"
        />
      </ReactFlow>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-popover/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur lg:flex">
        {Object.entries(domainStyles).map(([key, value]) => (
          <span key={key} className="flex items-center gap-1.5">
            <i
              className="size-1.5 rounded-full"
              style={{ background: value.color }}
            />
            {value.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function TableNodeCard({ data, selected }: NodeProps<TableNode>) {
  const { table, domain, dimmed } = data;
  const foreignColumns = new Set(table.foreignKeys.map((key) => key.from));
  const style = domainStyles[domain];

  return (
    <article
      className={`w-[340px] overflow-hidden rounded-[7px] border bg-card shadow-[0_9px_28px_#00000035] transition-[opacity,border-color,box-shadow] duration-200 ${
        dimmed
          ? "opacity-20"
          : selected
            ? "border-brand shadow-[0_0_0_2px_#b8b4f62b,0_12px_36px_#0007]"
            : "border-border-strong"
      }`}
    >
      <header
        className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5"
        style={{ boxShadow: `inset 3px 0 0 ${style.color}` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: style.color }}
          />
          <h2 className="truncate font-mono text-sm font-semibold tracking-[-0.01em] text-foreground">
            {table.name}
          </h2>
        </div>
        <span className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {style.label}
        </span>
      </header>
      <div className="py-1">
        {table.columns.map((column) => {
          const isForeign = foreignColumns.has(column.name);
          return (
            <div
              key={column.name}
              className="relative flex h-9 items-center gap-2 px-3 font-mono text-xs hover:bg-white/[0.025]"
              title={`${column.name}: ${column.type}${column.notnull ? " · required" : " · nullable"}${column.dflt_value === null ? "" : ` · default ${column.dflt_value}`}`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`${column.name}:target`}
                className="!left-[-3px] !size-1.5 !border-0 !bg-[#6e7180]"
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`${column.name}:source`}
                className="!right-[-3px] !size-1.5 !border-0 !bg-[#6e7180]"
              />
              <span className="flex w-3 shrink-0 justify-center">
                {column.pk > 0 ? (
                  <KeyRound
                    className="size-3 text-warning"
                    aria-label="Primary key"
                  />
                ) : isForeign ? (
                  <Link2
                    className="size-3 text-brand"
                    aria-label="Foreign key"
                  />
                ) : (
                  <span className="size-1 rounded-full bg-[#4b4d54]" />
                )}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${column.notnull || column.pk ? "text-foreground" : "text-muted-foreground"}`}
              >
                {column.name}
              </span>
              <span className="shrink-0 text-[12px] uppercase tracking-wide text-muted-foreground">
                {column.type || "any"}
                {!column.notnull && !column.pk && "?"}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function createGraph(tables: SchemaTable[], direction: Direction) {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: 48,
    ranksep: 110,
    marginx: 24,
    marginy: 24,
  });

  const nodes: TableNode[] = tables.map((table) => ({
    id: table.name,
    type: "table",
    position: { x: 0, y: 0 },
    data: { table, domain: getDomain(table.name) },
  }));
  const edges: Edge[] = tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      id: `${table.name}.${foreignKey.from}-${foreignKey.table}.${foreignKey.to}-${foreignKey.id}-${foreignKey.seq}`,
      source: foreignKey.table,
      sourceHandle: `${foreignKey.to}:source`,
      target: table.name,
      targetHandle: `${foreignKey.from}:target`,
      type: "smoothstep",
      style: { stroke: "#77738e", strokeWidth: 1.25, opacity: 0.72 },
    })),
  );

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: nodeWidth,
      height: 50 + node.data.table.columns.length * 36,
    });
  }
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id);
      const height = 50 + node.data.table.columns.length * 36;
      return {
        ...node,
        position: {
          x: position.x - nodeWidth / 2,
          y: position.y - height / 2,
        },
      };
    }),
    edges,
  };
}

function getDomain(tableName: string): Domain {
  if (["jobs", "job_sources", "duplicate_decisions"].includes(tableName))
    return "core";
  if (
    ["resources", "snapshots", "observations", "job_versions"].includes(
      tableName,
    )
  )
    return "collection";
  if (["companies", "configured_sources"].includes(tableName))
    return "workspace";
  if (tableName.startsWith("discovery_")) return "discovery";
  if (["assessments", "analysis_settings", "ai_usage"].includes(tableName))
    return "analysis";
  if (["job_preferences", "profile_revisions"].includes(tableName))
    return "profile";
  return "work";
}

function SchemaLoading() {
  return (
    <div className="relative h-full overflow-hidden bg-background p-6">
      <LoadingStatus>Loading database diagram</LoadingStatus>
      <div
        aria-hidden="true"
        className="mx-auto mt-12 grid max-w-3xl grid-cols-2 items-start gap-8"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`panel space-y-5 p-5 ${i === 1 ? "mt-16" : ""}`}
          >
            <Skeleton className="h-5 w-2/3" />
            {[0, 1, 2, 3, 4].map((j) => (
              <Skeleton key={j} className="h-3 w-4/5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

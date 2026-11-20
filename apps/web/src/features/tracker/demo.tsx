import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Banknote,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  CalendarDays,
  Clock3,
  Columns3,
  Filter,
  History as HistoryIcon,
  List,
  MapPin,
  Phone,
  SquarePen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import { ApplicationDetailReader } from "./application-detail-reader";
import { CompanyDetailReader } from "./company-detail-reader";

type Company = {
  id: string;
  name: string;
  website: string;
  location: string;
  description: string;
  contacts: string;
  status: string;
  notes: string;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
};
type Application = {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  status: string;
  type: string | null;
  description: string;
  location: string;
  employmentType: string;
  workMode: string;
  compensation: string;
  sourceUrl: string | null;
  appliedOn: string | null;
  contactedOn: string | null;
  followUpOn: string | null;
  contactName: string;
  contactEmail: string;
  channels: string;
  outcome: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
type DeleteTarget = {
  kind: "companies" | "applications";
  id: string;
  label: string;
  description: string;
};
type StatusTarget = {
  kind: "applications" | "companies";
  id: string;
  label: string;
  status: string;
};
const companyStatuses = ["Listed", "Lead", "Research", "Archived"];
const applicationStatuses = [
  "To apply",
  "Applied",
  "In conversation",
  "Closed",
];
type TrackerView = {
  id: string;
  label: string;
  status: string;
  sortKey: SortKey;
  direction: SortDirection;
};
const applicationViews: TrackerView[] = [
  {
    id: "all-applications",
    label: "All applications",
    status: "All statuses",
    sortKey: "recent",
    direction: "desc",
  },
  {
    id: "to-apply",
    label: "To apply",
    status: "To apply",
    sortKey: "recent",
    direction: "desc",
  },
  {
    id: "applied",
    label: "Applied",
    status: "Applied",
    sortKey: "applied",
    direction: "desc",
  },
  {
    id: "in-conversation",
    label: "In conversation",
    status: "In conversation",
    sortKey: "contacted",
    direction: "desc",
  },
  {
    id: "closed",
    label: "Closed",
    status: "Closed",
    sortKey: "recent",
    direction: "desc",
  },
];
const companyViews: TrackerView[] = [
  {
    id: "all-companies",
    label: "All companies",
    status: "All statuses",
    sortKey: "recent",
    direction: "desc",
  },
  {
    id: "listed",
    label: "Listed",
    status: "Listed",
    sortKey: "applications",
    direction: "desc",
  },
  {
    id: "leads",
    label: "Leads",
    status: "Lead",
    sortKey: "recent",
    direction: "desc",
  },
  {
    id: "research",
    label: "Research",
    status: "Research",
    sortKey: "recent",
    direction: "desc",
  },
  {
    id: "archived",
    label: "Archived",
    status: "Archived",
    sortKey: "recent",
    direction: "desc",
  },
];
type SortKey =
  | "recent"
  | "title"
  | "company"
  | "status"
  | "type"
  | "applied"
  | "contacted"
  | "followup"
  | "name"
  | "website"
  | "location"
  | "applications";
type SortDirection = "asc" | "desc";
type PageToken = number | "ellipsis";
const gridHead = "border-r border-border/70 last:border-r-0 whitespace-nowrap";
const gridCell = "border-r border-border/70 last:border-r-0";
const touchSelectItemClass = "[@media(hover:none)]:min-h-11";
const touchInputClass =
  "[@media(hover:none)]:h-11 [@media(hover:none)]:text-base";
const touchTextareaClass =
  "[@media(hover:none)]:min-h-20 [@media(hover:none)]:text-base";

function compareValues(
  left: string | number | null,
  right: string | number | null,
  direction: SortDirection,
) {
  if (left === null || left === "")
    return right === null || right === "" ? 0 : 1;
  if (right === null || right === "") return -1;
  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "asc" ? result : -result;
}

function getPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (currentPage >= totalPages - 3)
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}
function statusTone(status: string) {
  if (["Applied", "In conversation"].includes(status)) return "tone-mint";
  if (status === "To apply" || status === "Lead") return "tone-blue";
  if (status === "Research") return "tone-mint";
  return "tone-muted";
}
function companyMatchesFilter(company: Company, filter: string) {
  if (filter === "All statuses") return true;
  return company.status === filter;
}
function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = parseIsoDate(value);
  return date
    ? date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
function websiteLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const outcomeOptions = [
  "Offer accepted",
  "Offer declined",
  "Rejected by company",
  "No response",
  "Withdrew",
];

function outcomeToneClass(outcome: string): string {
  if (outcome === "Offer accepted") return "tone-mint";
  if (outcome === "Offer declined" || outcome === "Withdrew")
    return "tone-amber";
  return "tone-muted";
}

function postingLinksOf(value: string | null): string[] {
  return (value ?? "")
    .split(/\s+/)
    .map((link) => safeHttpUrl(link))
    .filter((link): link is string => Boolean(link));
}

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function TrackerDatePicker({
  value,
  onChange,
  label = "Last contacted",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const selectedDate = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = selectedDate ?? new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leadingDays = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      new Date(2024, 0, 7 + index),
    ),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && selectedDate) {
          setMonth(
            new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
          );
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={
            selectedDate
              ? `${label} ${selectedDate.toLocaleDateString()}`
              : `Choose ${label.toLowerCase()} date`
          }
          className="h-8 w-full min-w-36 justify-start px-2 font-normal [@media(hover:none)]:h-11 [@media(hover:none)]:text-base"
        >
          <CalendarDays className="size-3.5 text-muted-foreground" />
          {selectedDate
            ? selectedDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Add date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div
          className="w-56"
          role="group"
          aria-label="Choose last contacted date"
        >
          <div className="mb-2 flex h-8 items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm font-medium">{monthLabel}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDays.map((day, index) => (
              <span
                key={`${day}-${index}`}
                className="flex h-7 items-center justify-center text-xs text-muted-foreground"
              >
                {day}
              </span>
            ))}
            {Array.from({ length: leadingDays }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {Array.from({ length: dayCount }, (_, index) => {
              const date = new Date(year, monthIndex, index + 1);
              const isoDate = formatIsoDate(date);
              const selected = isoDate === value;
              return (
                <Button
                  key={isoDate}
                  type="button"
                  variant={selected ? "default" : "ghost"}
                  size="sm"
                  aria-label={date.toLocaleDateString(undefined, {
                    dateStyle: "full",
                  })}
                  aria-pressed={selected}
                  className="h-8 w-8 p-0 tabular-nums"
                  onClick={() => {
                    onChange(isoDate);
                    setOpen(false);
                  }}
                >
                  {index + 1}
                </Button>
              );
            })}
          </div>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function useRows() {
  const qc = useQueryClient();
  const companies = useQuery({
    queryKey: ["tracker", "companies"],
    queryFn: () => apiClient<Company[]>("/api/tracker/companies"),
  });
  const applications = useQuery({
    queryKey: ["tracker", "applications"],
    queryFn: () => apiClient<Application[]>("/api/tracker/applications"),
  });
  const save = useMutation({
    mutationFn: ({
      kind,
      id,
      body,
    }: {
      kind: "companies" | "applications";
      id: string;
      body: Record<string, unknown>;
    }) =>
      apiClient(`/api/tracker/${kind}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_result, { kind }) => {
      void qc.invalidateQueries({ queryKey: ["tracker"] });
      toast.success(
        kind === "companies" ? "Company updated" : "Application updated",
      );
    },
  });
  const remove = useMutation({
    mutationFn: ({
      kind,
      id,
    }: {
      kind: "companies" | "applications";
      id: string;
    }) => apiClient(`/api/tracker/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: (_result, { kind }) => {
      void qc.invalidateQueries({ queryKey: ["tracker"] });
      toast.success(
        kind === "companies" ? "Company deleted" : "Application deleted",
      );
    },
  });
  const create = useMutation({
    mutationFn: ({
      kind,
      body,
    }: {
      kind: "companies" | "applications";
      body: Record<string, unknown>;
    }) =>
      apiClient(`/api/tracker/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_result, { kind }) => {
      void qc.invalidateQueries({ queryKey: ["tracker"] });
      toast.success(
        kind === "companies" ? "Company added" : "Application added",
      );
    },
  });
  return { companies, applications, save, remove, create };
}
export function TrackerWorkspace({
  page,
}: {
  page: "applications" | "companies";
}) {
  const {
    companies: companyQuery,
    applications: applicationQuery,
    save,
    remove,
    create,
  } = useRows();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("All statuses");
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  }>({ key: "recent", direction: "desc" });
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const isBoard = page === "applications" && params.get("view") === "board";
  const setViewMode = (mode: "list" | "board") => {
    const next = new URLSearchParams(params);
    if (mode === "board") next.set("view", "board");
    else next.delete("view");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const viewRailRef = useRef<HTMLDivElement>(null);
  const viewDrag = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressViewClick = useRef(false);
  const [isViewDragging, setIsViewDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
  const [editor, setEditor] = useState<
    | { kind: "application"; item: Application | null }
    | { kind: "company"; item: Company | null }
    | null
  >(null);
  const companyFilter = params.get("company");
  const selectedApplicationId =
    page === "applications" ? params.get("application") : null;
  const selectedCompanyId = page === "companies" ? params.get("company") : null;
  const companies = companyQuery.data ?? [];
  const applications = applicationQuery.data ?? [];
  const selectedApplication = applications.find(
    (application) => application.id === selectedApplicationId,
  );
  const selectedCompany = companies.find(
    (company) => company.id === selectedCompanyId,
  );
  const companyApplications = selectedCompany
    ? applications.filter(
        (application) => application.companyId === selectedCompany.id,
      )
    : [];
  const normalizedQuery = query.trim().toLowerCase();
  const sortOptions: { value: SortKey; label: string }[] =
    page === "applications"
      ? [
          { value: "recent", label: "Recently updated" },
          { value: "title", label: "Opportunity" },
          { value: "company", label: "Company" },
          { value: "status", label: "Status" },
          { value: "type", label: "Type" },
          { value: "applied", label: "Date applied" },
          { value: "contacted", label: "Last contacted" },
          { value: "followup", label: "Next follow-up" },
        ]
      : [
          { value: "recent", label: "Recently updated" },
          { value: "name", label: "Company" },
          { value: "website", label: "Website" },
          { value: "location", label: "Location" },
          { value: "status", label: "Status" },
          { value: "applications", label: "Applications" },
        ];
  const activeSort = sortOptions.some((option) => option.value === sort.key)
    ? sort
    : { key: "recent" as const, direction: "desc" as const };
  const views = page === "applications" ? applicationViews : companyViews;
  const currentView = views.find(
    (view) =>
      view.status === filter &&
      view.sortKey === activeSort.key &&
      view.direction === activeSort.direction,
  );
  const applyView = (viewId: string) => {
    const view = views.find((candidate) => candidate.id === viewId);
    if (!view) return;
    setFilter(view.status);
    setSort({ key: view.sortKey, direction: view.direction });
    setPageNumber(1);
  };
  const countForView = (view: TrackerView) => {
    if (page === "applications") {
      return applications.filter((application) => {
        const searchable = `${application.title} ${application.companyName} ${application.status} ${application.type ?? ""} ${application.location} ${application.employmentType} ${application.workMode} ${application.compensation} ${application.contactName} ${application.contactEmail} ${application.channels} ${application.sourceUrl ?? ""} ${application.description} ${application.outcome} ${application.notes}`;
        return (
          (!companyFilter || application.companyId === companyFilter) &&
          searchable.toLowerCase().includes(normalizedQuery) &&
          (view.status === "All statuses" || application.status === view.status)
        );
      }).length;
    }

    return companies.filter((company) => {
      const searchable = `${company.name} ${company.website} ${company.location} ${company.description} ${company.contacts} ${company.status} ${company.notes}`;
      return (
        searchable.toLowerCase().includes(normalizedQuery) &&
        companyMatchesFilter(company, view.status)
      );
    }).length;
  };
  const filteredCompanies = companies
    .filter(
      (c) =>
        `${c.name} ${c.website} ${c.location} ${c.description} ${c.contacts} ${c.status} ${c.notes}`
          .toLowerCase()
          .includes(normalizedQuery) && companyMatchesFilter(c, filter),
    )
    .toSorted((a, b) => {
      const left =
        activeSort.key === "recent"
          ? a.updatedAt
          : activeSort.key === "website"
            ? websiteLabel(a.website)
            : activeSort.key === "location"
              ? a.location
              : activeSort.key === "status"
                ? a.status
                : activeSort.key === "applications"
                  ? a.applicationCount
                  : a.name;
      const right =
        activeSort.key === "recent"
          ? b.updatedAt
          : activeSort.key === "website"
            ? websiteLabel(b.website)
            : activeSort.key === "location"
              ? b.location
              : activeSort.key === "status"
                ? b.status
                : activeSort.key === "applications"
                  ? b.applicationCount
                  : b.name;
      const direction =
        activeSort.key === "recent" ? "desc" : activeSort.direction;
      return compareValues(left, right, direction) || a.id.localeCompare(b.id);
    });
  const filteredApplications = applications
    .filter(
      (a) =>
        (!companyFilter || a.companyId === companyFilter) &&
        `${a.title} ${a.companyName} ${a.status} ${a.type ?? ""} ${a.location} ${a.employmentType} ${a.workMode} ${a.compensation} ${a.contactName} ${a.contactEmail} ${a.channels} ${a.sourceUrl ?? ""} ${a.description} ${a.outcome} ${a.notes}`
          .toLowerCase()
          .includes(normalizedQuery) &&
        (filter === "All statuses" || a.status === filter),
    )
    .toSorted((a, b) => {
      const left =
        activeSort.key === "recent"
          ? a.updatedAt
          : activeSort.key === "company"
            ? a.companyName
            : activeSort.key === "status"
              ? a.status
              : activeSort.key === "type"
                ? a.type
                : activeSort.key === "contacted"
                  ? a.contactedOn
                  : activeSort.key === "applied"
                    ? a.appliedOn
                    : activeSort.key === "followup"
                      ? a.followUpOn
                      : a.title;
      const right =
        activeSort.key === "recent"
          ? b.updatedAt
          : activeSort.key === "company"
            ? b.companyName
            : activeSort.key === "status"
              ? b.status
              : activeSort.key === "type"
                ? b.type
                : activeSort.key === "contacted"
                  ? b.contactedOn
                  : activeSort.key === "applied"
                    ? b.appliedOn
                    : activeSort.key === "followup"
                      ? b.followUpOn
                      : b.title;
      const direction =
        activeSort.key === "recent" ? "desc" : activeSort.direction;
      return compareValues(left, right, direction) || a.id.localeCompare(b.id);
    });
  const boardApplications = applications.filter(
    (a) =>
      (!companyFilter || a.companyId === companyFilter) &&
      `${a.title} ${a.companyName} ${a.status} ${a.type ?? ""} ${a.location} ${a.employmentType} ${a.workMode} ${a.compensation} ${a.contactName} ${a.contactEmail} ${a.sourceUrl ?? ""} ${a.description} ${a.outcome} ${a.notes}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const boardColumns: { status: string; items: Application[] }[] =
    applicationStatuses.map((status) => ({
      status,
      items: boardApplications
        .filter((a) => a.status === status)
        .toSorted(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        ),
    }));
  const moveApplicationStatus = (application: Application, status: string) => {
    if (application.status === status || save.isPending) return;
    save.mutate({ kind: "applications", id: application.id, body: { status } });
  };
  const openApplicationReader = (application: Application) => {
    const next = new URLSearchParams(params);
    next.set("application", application.id);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const busy =
    page === "applications"
      ? companyQuery.isLoading || applicationQuery.isLoading
      : companyQuery.isLoading;
  const error =
    page === "applications"
      ? companyQuery.error || applicationQuery.error
      : companyQuery.error;
  const failedWithoutData =
    Boolean(error) &&
    (page === "applications"
      ? companyQuery.data === undefined || applicationQuery.data === undefined
      : companyQuery.data === undefined);
  const statuses =
    page === "applications" ? applicationStatuses : companyStatuses;
  const columns: {
    label: string;
    width: string;
  }[] =
    page === "applications"
      ? [
          { label: "Opportunity", width: "min-w-[190px]" },
          { label: "Company", width: "min-w-[132px]" },
          { label: "Status", width: "min-w-[124px]" },
          { label: "Type", width: "min-w-[84px]" },
          {
            label: "Last contacted",
            width: "min-w-[124px]",
          },
          { label: "Outcome", width: "min-w-[150px]" },
          { label: "Links", width: "min-w-[72px]" },
          { label: "Actions", width: "min-w-[128px]" },
        ]
      : [
          { label: "Company", width: "min-w-[220px]" },
          { label: "Website", width: "min-w-[180px]" },
          { label: "Location", width: "min-w-[180px]" },
          { label: "Status", width: "min-w-[150px]" },
          {
            label: "Applications",
            width: "min-w-[160px]",
          },
          { label: "Actions", width: "min-w-[136px]" },
        ];
  const tableRows =
    page === "applications" ? filteredApplications : filteredCompanies;
  const shownCount = tableRows.length;
  const displayCount = isBoard ? boardApplications.length : shownCount;
  const totalPages = Math.max(1, Math.ceil(shownCount / pageSize));
  const currentPage = Math.min(pageNumber, totalPages);
  const firstRow = shownCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, shownCount);
  const visibleApplications = filteredApplications.slice(firstRow - 1, lastRow);
  const visibleCompanies = filteredCompanies.slice(firstRow - 1, lastRow);
  const saveEditor = async (
    id: string | undefined,
    body: Record<string, unknown>,
  ) => {
    const kind = editor?.kind === "company" ? "companies" : "applications";
    const result = id
      ? await save.mutateAsync({ kind, id, body })
      : await create.mutateAsync({ kind, body });
    setPageNumber(1);
    return result;
  };
  const openNewEditor = () => {
    setPageNumber(1);
    setEditor({
      kind: page === "companies" ? "company" : "application",
      item: null,
    });
  };
  const retryLoad = () => {
    if (page === "applications") {
      void Promise.all([companyQuery.refetch(), applicationQuery.refetch()]);
    } else {
      void companyQuery.refetch();
    }
  };
  const clearFilters = () => {
    setQuery("");
    setFilter("All statuses");
    setSort({ key: "recent", direction: "desc" });
    setParams({});
    setPageNumber(1);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(
      { kind: deleteTarget.kind, id: deleteTarget.id },
      {
        onSuccess: () => {
          if (
            deleteTarget.kind === "applications" &&
            deleteTarget.id === selectedApplicationId
          ) {
            closeApplicationReader();
          }
          if (
            deleteTarget.kind === "companies" &&
            deleteTarget.id === selectedCompanyId
          ) {
            closeCompanyReader();
          }
          setDeleteTarget(null);
        },
      },
    );
  };
  const closeApplicationReader = () => {
    const next = new URLSearchParams(params);
    next.delete("application");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const closeCompanyReader = () => {
    const next = new URLSearchParams(params);
    next.delete("company");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden">
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pt-4 pb-2 sm:px-4 sm:pt-5 sm:pb-2">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-end gap-4">
            <h1 className="sr-only">
              {page === "applications" ? "Applications" : "Companies"}
            </h1>
            <Button
              disabled={
                busy ||
                create.isPending ||
                save.isPending ||
                remove.isPending ||
                (!companies.length && page === "applications")
              }
              className="[@media(hover:none)]:h-11"
              onClick={openNewEditor}
            >
              <Plus /> Add {page === "applications" ? "application" : "company"}
            </Button>
          </div>
          {!isBoard && (
            <div
              ref={viewRailRef}
              className={`mt-2 min-w-0 shrink-0 touch-pan-x overflow-x-auto ${isViewDragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse" || event.button !== 0) return;
                viewDrag.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startScrollLeft: event.currentTarget.scrollLeft,
                  moved: false,
                };
              }}
              onPointerMove={(event) => {
                const drag = viewDrag.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const delta = event.clientX - drag.startX;
                if (!drag.moved && Math.abs(delta) > 4) {
                  drag.moved = true;
                  setIsViewDragging(true);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                if (drag.moved) {
                  event.currentTarget.scrollLeft = drag.startScrollLeft - delta;
                }
              }}
              onPointerUp={(event) => {
                const drag = viewDrag.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                if (drag.moved) {
                  suppressViewClick.current = true;
                  window.setTimeout(() => {
                    suppressViewClick.current = false;
                  }, 0);
                }
                viewDrag.current = null;
                setIsViewDragging(false);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                viewDrag.current = null;
                setIsViewDragging(false);
              }}
              onClickCapture={(event) => {
                if (!suppressViewClick.current) return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <Tabs
                value={currentView?.id ?? "custom"}
                onValueChange={applyView}
              >
                <TabsList
                  aria-label={
                    page === "applications"
                      ? "Application views"
                      : "Company views"
                  }
                  className="w-max min-w-full gap-3 sm:gap-5"
                >
                  {!currentView && (
                    <TabsTrigger value="custom" className="px-2">
                      Custom
                    </TabsTrigger>
                  )}
                  {views.map((view) => (
                    <TabsTrigger
                      key={view.id}
                      value={view.id}
                      className="group gap-1.5 px-2"
                    >
                      <span>{view.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground group-data-[state=active]:text-foreground">
                        {countForView(view)}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
            <div
              role="search"
              aria-label={
                page === "applications"
                  ? "Search applications"
                  : "Search companies"
              }
              className="relative w-full min-w-44 sm:w-[19rem] sm:flex-none"
            >
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInputRef}
                role="searchbox"
                className="h-8 pl-8 pr-9 [@media(hover:none)]:h-11 [@media(hover:none)]:text-base"
                aria-label={
                  page === "applications"
                    ? "Search applications by role, company, or details"
                    : "Search companies by name, website, location, or notes"
                }
                placeholder={
                  page === "applications"
                    ? "Search roles or companies…"
                    : "Search companies or locations…"
                }
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPageNumber(1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                    setPageNumber(1);
                  }
                }}
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground [@media(hover:none)]:size-11"
                  onClick={() => {
                    setQuery("");
                    setPageNumber(1);
                    searchInputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              )}
            </div>
            {!isBoard && (
              <>
                <Select
                  value={filter}
                  onValueChange={(value) => {
                    setFilter(value);
                    setPageNumber(1);
                  }}
                >
                  <SelectTrigger
                    aria-label="Filter by status"
                    className={`h-8 w-auto min-w-40 ${touchInputClass}`}
                  >
                    <Filter
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem
                      value="All statuses"
                      className={touchSelectItemClass}
                    >
                      All statuses
                    </SelectItem>
                    {statuses.map((s) => (
                      <SelectItem
                        key={s}
                        value={s}
                        className={touchSelectItemClass}
                      >
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={activeSort.key}
                  onValueChange={(value) => {
                    const key = value as SortKey;
                    setSort({
                      key,
                      direction: key === "recent" ? "desc" : "asc",
                    });
                    setPageNumber(1);
                  }}
                >
                  <SelectTrigger
                    aria-label="Sort rows"
                    className={`h-8 w-auto min-w-44 ${touchInputClass}`}
                  >
                    <ArrowDownUp
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {sortOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className={touchSelectItemClass}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {page === "applications" && (
                <Tabs
                  value={isBoard ? "board" : "list"}
                  onValueChange={(value) =>
                    setViewMode(value as "list" | "board")
                  }
                >
                  <TabsList aria-label="Tracker layout">
                    <TabsTrigger value="list" className="gap-1.5 px-3">
                      <List aria-hidden="true" className="size-3.5" />
                      List
                    </TabsTrigger>
                    <TabsTrigger value="board" className="gap-1.5 px-3">
                      <Columns3 aria-hidden="true" className="size-3.5" />
                      Board
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-xs tabular-nums text-muted-foreground"
              >
                {busy
                  ? "Loading…"
                  : `${displayCount} ${displayCount === 1 ? "record" : "records"}`}
              </span>
            </div>
          </div>
          {companyFilter && page === "applications" && (
            <div className="mt-3">
              <Badge
                variant="outline"
                className="gap-1.5 rounded-md py-1 pl-2 text-xs font-normal"
              >
                <span>
                  Company:{" "}
                  {companies.find((c) => c.id === companyFilter)?.name ??
                    "company"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove company filter"
                  title="Remove company filter"
                  className="-mr-1 size-6 rounded-sm text-muted-foreground hover:text-foreground [@media(hover:none)]:size-11"
                  onClick={() => {
                    setParams({});
                    setPageNumber(1);
                  }}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              </Badge>
            </div>
          )}
          {error && !failedWithoutData && (
            <div
              role="alert"
              className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
            >
              <p>Could not refresh tracker data: {error.message}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive [@media(hover:none)]:h-11"
                onClick={retryLoad}
              >
                <RefreshCw /> Retry
              </Button>
            </div>
          )}
          <span role="status" className="sr-only">
            {busy ? `Loading ${page}.` : ""}
          </span>
          {isBoard ? (
            <TrackerBoard
              columns={boardColumns}
              busy={busy}
              failedWithoutData={failedWithoutData}
              errorMessage={error?.message}
              onRetry={retryLoad}
              selectedApplicationId={selectedApplicationId}
              onOpen={openApplicationReader}
              onMove={moveApplicationStatus}
              isSaving={save.isPending}
              onEdit={(application) =>
                setEditor({ kind: "application", item: application })
              }
              onDelete={(application) => {
                remove.reset();
                setDeleteTarget({
                  kind: "applications",
                  id: application.id,
                  label: application.title,
                  description:
                    "This opportunity will be removed from your tracker.",
                });
              }}
            />
          ) : (
            <>
              <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background">
                <Table
                  aria-label={
                    page === "applications" ? "Applications" : "Companies"
                  }
                  aria-busy={busy}
                  containerProps={{
                    tabIndex: 0,
                    role: "region",
                    "aria-label": `${page === "applications" ? "Applications" : "Companies"} table. Scroll horizontally to view all columns.`,
                    className: "min-h-0 flex-1 overflow-auto",
                  }}
                  className={`w-full ${page === "applications" ? "min-w-[900px]" : "min-w-[1200px]"}`}
                >
                  <TableCaption className="sr-only">
                    {page === "applications"
                      ? "Job applications"
                      : "Tracked companies"}
                  </TableCaption>
                  <TableHeader className="sticky top-0 z-20 bg-muted">
                    <TableRow className="hover:bg-transparent">
                      {columns.map((column) => {
                        return (
                          <TableHead
                            key={column.label}
                            className={`${gridHead} h-9 bg-muted [@media(hover:none)]:h-11 ${column.width} ${column.label === "Actions" ? "text-right" : ""}`}
                          >
                            <span
                              className={
                                column.label === "Actions"
                                  ? "block text-right"
                                  : ""
                              }
                            >
                              {column.label}
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider delayDuration={300}>
                      {busy ? (
                        Array.from({ length: 6 }, (_, rowIndex) => (
                          <TableRow
                            key={`loading-${rowIndex}`}
                            aria-hidden="true"
                          >
                            {columns.map((column, columnIndex) => (
                              <TableCell
                                key={column.label}
                                className={gridCell}
                              >
                                <Skeleton
                                  className={
                                    columnIndex === 0
                                      ? "h-4 w-3/4"
                                      : "h-4 w-2/3"
                                  }
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : shownCount === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={columns.length}
                            className="py-12 text-center"
                          >
                            {failedWithoutData ? (
                              <div className="mx-auto max-w-md">
                                <p className="text-sm font-medium">
                                  Couldn’t load {page}.
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {error?.message ??
                                    "Check your connection and try again."}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-3 [@media(hover:none)]:h-11"
                                  disabled={busy}
                                  onClick={retryLoad}
                                >
                                  <RefreshCw
                                    className={busy ? "animate-spin" : ""}
                                  />
                                  Try again
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm font-medium">
                                  {normalizedQuery ||
                                  filter !== "All statuses" ||
                                  companyFilter
                                    ? `No matching ${page}.`
                                    : `No ${page} yet.`}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {normalizedQuery ||
                                  filter !== "All statuses" ||
                                  companyFilter
                                    ? "Adjust the search or status filter to see more rows."
                                    : page === "applications" &&
                                        companies.length === 0
                                      ? "Add a company first, then connect applications to it."
                                      : `Add a ${page === "applications" ? "application" : "company"} to get started.`}
                                </p>
                                <div className="mt-3 flex flex-wrap justify-center gap-2">
                                  {(normalizedQuery ||
                                    filter !== "All statuses" ||
                                    companyFilter) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="[@media(hover:none)]:h-11"
                                      onClick={clearFilters}
                                    >
                                      Clear filters
                                    </Button>
                                  )}
                                  {!(
                                    page === "applications" &&
                                    companies.length === 0
                                  ) ? (
                                    <Button
                                      size="sm"
                                      className="[@media(hover:none)]:h-11"
                                      onClick={openNewEditor}
                                    >
                                      <Plus /> Add{" "}
                                      {page === "applications"
                                        ? "application"
                                        : "company"}
                                    </Button>
                                  ) : (
                                    <Button
                                      asChild
                                      size="sm"
                                      className="[@media(hover:none)]:h-11"
                                    >
                                      <Link to="/companies">Add a company</Link>
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : page === "applications" ? (
                        visibleApplications.map((application) => (
                          <TableRow
                            key={application.id}
                            className={
                              application.id === selectedApplicationId
                                ? "bg-accent/50"
                                : undefined
                            }
                          >
                            <TableCell
                              className={`${gridCell} font-medium text-foreground`}
                            >
                              <button
                                type="button"
                                className="max-w-full truncate rounded-sm text-left font-medium text-foreground underline-offset-4 hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label={`View details for ${application.title}`}
                                aria-current={
                                  application.id === selectedApplicationId
                                    ? "true"
                                    : undefined
                                }
                                onClick={() => {
                                  const next = new URLSearchParams(params);
                                  next.set("application", application.id);
                                  setParams(next, {
                                    replace: true,
                                    preventScrollReset: true,
                                  });
                                }}
                              >
                                {application.title}
                              </button>
                            </TableCell>
                            <TableCell className={gridCell}>
                              {application.companyName}
                            </TableCell>
                            <TableCell className={gridCell}>
                              <StatusBadge status={application.status} />
                            </TableCell>
                            <TableCell className={gridCell}>
                              {application.type ?? "—"}
                            </TableCell>
                            <TableCell className={`${gridCell} tabular-nums`}>
                              {dateLabel(application.contactedOn)}
                            </TableCell>
                            <TableCell className={gridCell}>
                              {application.outcome ? (
                                <Badge
                                  className={`status-pill ${outcomeToneClass(application.outcome)}`}
                                  variant="outline"
                                >
                                  {application.outcome}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={gridCell}>
                              {(() => {
                                const links = postingLinksOf(
                                  application.sourceUrl,
                                );
                                return links.length ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <a
                                      href={links[0]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`Open ${application.title} posting in browser`}
                                      title={links[0]}
                                      className="inline-flex size-8 items-center justify-center rounded-md text-brand hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <ExternalLink
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </a>
                                    {links.length > 1 ? (
                                      <span className="text-xs text-muted-foreground tabular-nums">
                                        +{links.length - 1}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className={`${gridCell} text-right`}>
                              <RowActions
                                label={application.title}
                                onStatusChange={() =>
                                  setStatusTarget({
                                    kind: "applications",
                                    id: application.id,
                                    label: application.title,
                                    status: application.status,
                                  })
                                }
                                onEdit={() =>
                                  setEditor({
                                    kind: "application",
                                    item: application,
                                  })
                                }
                                onDelete={() => {
                                  remove.reset();
                                  setDeleteTarget({
                                    kind: "applications",
                                    id: application.id,
                                    label: application.title,
                                    description:
                                      "This opportunity will be removed from your tracker.",
                                  });
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        visibleCompanies.map((company) => (
                          <TableRow
                            key={company.id}
                            className={
                              company.id === selectedCompanyId
                                ? "bg-accent/50"
                                : undefined
                            }
                          >
                            <TableCell
                              className={`${gridCell} font-medium text-foreground`}
                            >
                              <button
                                type="button"
                                className="max-w-full truncate rounded-sm text-left font-medium text-foreground underline-offset-4 hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label={`View details for company ${company.name}`}
                                aria-current={
                                  company.id === selectedCompanyId
                                    ? "true"
                                    : undefined
                                }
                                onClick={() => {
                                  const next = new URLSearchParams(params);
                                  next.set("company", company.id);
                                  setParams(next, {
                                    replace: true,
                                    preventScrollReset: true,
                                  });
                                }}
                              >
                                {company.name}
                              </button>
                            </TableCell>
                            <TableCell className={gridCell}>
                              {company.website ? (
                                <a
                                  href={company.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand underline underline-offset-4"
                                >
                                  {websiteLabel(company.website)}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={gridCell}>
                              {company.location || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={gridCell}>
                              <StatusBadge status={company.status} />
                            </TableCell>
                            <TableCell className={gridCell}>
                              <Link
                                className="text-brand underline-offset-4 hover:underline"
                                to={`/applications?company=${company.id}`}
                              >
                                {company.applicationCount}{" "}
                                {company.applicationCount === 1
                                  ? "application"
                                  : "applications"}
                              </Link>
                            </TableCell>
                            <TableCell className={`${gridCell} text-right`}>
                              <RowActions
                                label={company.name}
                                onStatusChange={() =>
                                  setStatusTarget({
                                    kind: "companies",
                                    id: company.id,
                                    label: company.name,
                                    status: company.status,
                                  })
                                }
                                onEdit={() =>
                                  setEditor({ kind: "company", item: company })
                                }
                                onDelete={() => {
                                  remove.reset();
                                  setDeleteTarget({
                                    kind: "companies",
                                    id: company.id,
                                    label: company.name,
                                    description:
                                      company.applicationCount > 0
                                        ? `Deleting this company also permanently removes ${company.applicationCount} linked application${company.applicationCount === 1 ? "" : "s"}.`
                                        : "This company will be removed from your tracker.",
                                  });
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TooltipProvider>
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 shrink-0 text-xs text-muted-foreground 2xl:hidden">
                Scroll horizontally to see all columns.
              </p>
              <div className="mt-1 flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span id="tracker-page-size-label">Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPageNumber(1);
                    }}
                  >
                    <SelectTrigger
                      aria-labelledby="tracker-page-size-label"
                      className="h-8 w-[4.5rem] [@media(hover:none)]:h-11"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {[10, 25, 50].map((size) => (
                        <SelectItem
                          key={size}
                          value={String(size)}
                          className={touchSelectItemClass}
                        >
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p
                  aria-live="polite"
                  className="text-xs tabular-nums text-muted-foreground"
                >
                  Showing {firstRow}–{lastRow} of {shownCount}
                </p>
                <nav
                  aria-label="Table pagination"
                  className="flex items-center gap-1"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="First page"
                    title="First page"
                    className="hidden [@media(hover:none)]:size-11 sm:inline-flex"
                    disabled={busy || currentPage <= 1}
                    onClick={() => setPageNumber(1)}
                  >
                    <ChevronsLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    title="Previous page"
                    className="size-8 [@media(hover:none)]:size-11"
                    disabled={busy || currentPage <= 1}
                    onClick={() => setPageNumber(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <div className="hidden items-center gap-1 px-1 sm:flex">
                    {getPageTokens(currentPage, totalPages).map(
                      (token, index) =>
                        token === "ellipsis" ? (
                          <span
                            key={`ellipsis-${index}`}
                            aria-hidden="true"
                            className="px-1 text-muted-foreground"
                          >
                            …
                          </span>
                        ) : (
                          <Button
                            key={token}
                            type="button"
                            variant={
                              token === currentPage ? "secondary" : "ghost"
                            }
                            size="sm"
                            aria-label={`Page ${token}`}
                            aria-current={
                              token === currentPage ? "page" : undefined
                            }
                            className="h-8 min-w-8 px-2 tabular-nums [@media(hover:none)]:h-11 [@media(hover:none)]:min-w-11"
                            disabled={busy}
                            onClick={() => setPageNumber(token)}
                          >
                            {token}
                          </Button>
                        ),
                    )}
                  </div>
                  <span className="px-2 text-xs tabular-nums text-muted-foreground sm:hidden">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Next page"
                    title="Next page"
                    className="size-8 [@media(hover:none)]:size-11"
                    disabled={busy || currentPage >= totalPages}
                    onClick={() =>
                      setPageNumber(Math.min(totalPages, currentPage + 1))
                    }
                  >
                    <ChevronRight />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Last page"
                    title="Last page"
                    className="hidden [@media(hover:none)]:size-11 sm:inline-flex"
                    disabled={busy || currentPage >= totalPages}
                    onClick={() => setPageNumber(totalPages)}
                  >
                    <ChevronsRight />
                  </Button>
                </nav>
              </div>
            </>
          )}
          {editor?.kind === "application" && (
            <ApplicationEditorSheet
              key={editor.item?.id ?? "new-application"}
              item={editor.item}
              companies={companies}
              defaultCompanyId={companyFilter ?? companies[0]?.id ?? ""}
              isSaving={save.isPending || create.isPending}
              onOpenChange={(open) => !open && setEditor(null)}
              onSave={saveEditor}
            />
          )}
          {editor?.kind === "company" && (
            <CompanyEditorSheet
              key={editor.item?.id ?? "new-company"}
              item={editor.item}
              isSaving={save.isPending || create.isPending}
              onOpenChange={(open) => !open && setEditor(null)}
              onSave={saveEditor}
            />
          )}
          {statusTarget && (
            <StatusChangeDialog
              key={`${statusTarget.kind}-${statusTarget.id}`}
              target={statusTarget}
              isSaving={save.isPending}
              onOpenChange={(open) => !open && setStatusTarget(null)}
              onSave={async (status) => {
                await save.mutateAsync({
                  kind: statusTarget.kind,
                  id: statusTarget.id,
                  body: { status },
                });
                setStatusTarget(null);
              }}
            />
          )}
          {deleteTarget && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open && !remove.isPending) setDeleteTarget(null);
              }}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    Delete{" "}
                    {deleteTarget.kind === "companies"
                      ? "company"
                      : "application"}
                    ?
                  </DialogTitle>
                  <DialogDescription>
                    <span className="font-medium text-foreground">
                      {deleteTarget.label}
                    </span>
                    <span className="mt-1 block">
                      {deleteTarget.description}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                {remove.error && (
                  <p role="alert" className="text-sm text-destructive">
                    Could not delete this item. {remove.error.message}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={remove.isPending}
                    className="[@media(hover:none)]:h-11"
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 [@media(hover:none)]:h-11"
                    disabled={remove.isPending}
                    onClick={confirmDelete}
                  >
                    {remove.isPending ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    {remove.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </main>
      {page === "applications" && selectedApplicationId ? (
        <ApplicationDetailReader
          application={selectedApplication ?? null}
          loading={applicationQuery.isLoading}
          onClose={closeApplicationReader}
        />
      ) : null}
      {page === "companies" && selectedCompanyId ? (
        <CompanyDetailReader
          company={selectedCompany ?? null}
          applications={companyApplications}
          loading={companyQuery.isLoading || applicationQuery.isLoading}
          onClose={closeCompanyReader}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`status-pill ${statusTone(status)}`} variant="outline">
      {status}
    </Badge>
  );
}

function statusDotClass(status: string) {
  if (status === "To apply") return "bg-[var(--info)]";
  if (status === "Applied") return "bg-[var(--success)]";
  if (status === "In conversation") return "bg-[var(--warning)]";
  return "bg-muted-foreground/60";
}

function shortDate(value: string | null) {
  if (!value) return null;
  const date =
    parseIsoDate(value) ?? parseIsoDate(value.slice(0, 10)) ?? undefined;
  return date
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
}

function TrackerBoard({
  columns,
  busy,
  failedWithoutData,
  errorMessage,
  onRetry,
  selectedApplicationId,
  onOpen,
  onMove,
  isSaving,
  onEdit,
  onDelete,
}: {
  columns: { status: string; items: Application[] }[];
  busy: boolean;
  failedWithoutData: boolean;
  errorMessage?: string;
  onRetry: () => void;
  selectedApplicationId: string | null;
  onOpen: (application: Application) => void;
  onMove: (application: Application, status: string) => void;
  isSaving: boolean;
  onEdit: (application: Application) => void;
  onDelete: (application: Application) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  if (failedWithoutData) {
    return (
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-border bg-background text-center">
        <div className="max-w-md p-8">
          <p className="text-sm font-medium">Couldn’t load the board.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessage ?? "Check your connection and try again."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 [@media(hover:none)]:h-11"
            disabled={busy}
            onClick={onRetry}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="region"
        aria-label="Applications board"
        className="mt-1 min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex h-full min-h-0 gap-2 overflow-x-auto pb-1">
          {columns.map((column) => {
            const isDraggingColumn = column.items.some(
              (item) => item.id === draggingId,
            );
            return (
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drop target only; the status chip menu is the keyboard and touch path
              <section
                key={column.status}
                aria-label={`${column.status}, ${column.items.length} application${
                  column.items.length === 1 ? "" : "s"
                }`}
                className={`flex h-full min-h-0 min-w-60 flex-1 flex-col overflow-hidden rounded-md border bg-background transition-colors ${
                  dragOverStatus === column.status && draggingId
                    ? "border-brand"
                    : "border-border"
                }`}
                onDragOver={(event) => {
                  if (!draggingId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverStatus(column.status);
                }}
                onDragLeave={(event) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                  ) {
                    return;
                  }
                  setDragOverStatus((current) =>
                    current === column.status ? null : current,
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain");
                  const application = columns
                    .flatMap((candidate) => candidate.items)
                    .find((item) => item.id === id);
                  if (application) onMove(application, column.status);
                  setDraggingId(null);
                  setDragOverStatus(null);
                }}
              >
                <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/50 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${statusDotClass(column.status)}`}
                  />
                  <h2 className="text-sm font-semibold">{column.status}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {column.items.length}
                  </span>
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {busy && column.items.length === 0
                    ? Array.from({ length: 3 }, (_, index) => (
                        <Skeleton
                          key={`loading-${index}`}
                          className="h-20 w-full rounded-md"
                          aria-hidden="true"
                        />
                      ))
                    : column.items.map((application) => (
                        <BoardCard
                          key={application.id}
                          application={application}
                          selected={application.id === selectedApplicationId}
                          dragging={draggingId === application.id}
                          isSaving={isSaving}
                          onOpen={onOpen}
                          onMove={onMove}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onDragStateChange={(id) => {
                            setDraggingId(id);
                            setDragOverStatus(null);
                          }}
                        />
                      ))}
                  {column.items.length === 0 && !busy && (
                    <p className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                      {draggingId && !isDraggingColumn
                        ? "Drop to move here"
                        : "No applications"}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

function BoardCard({
  application,
  selected,
  dragging,
  isSaving,
  onOpen,
  onMove,
  onEdit,
  onDelete,
  onDragStateChange,
}: {
  application: Application;
  selected: boolean;
  dragging: boolean;
  isSaving: boolean;
  onOpen: (application: Application) => void;
  onMove: (application: Application, status: string) => void;
  onEdit: (application: Application) => void;
  onDelete: (application: Application) => void;
  onDragStateChange: (id: string | null) => void;
}) {
  const sourceUrl = safeHttpUrl(application.sourceUrl);
  const compensation =
    application.compensation && application.compensation.trim() !== "—"
      ? application.compensation
      : null;
  const milestone = application.followUpOn
    ? {
        icon: Clock3,
        text: `Follow-up · ${shortDate(application.followUpOn)}`,
        due: true,
      }
    : application.contactedOn
      ? {
          icon: Phone,
          text: `Contacted · ${shortDate(application.contactedOn)}`,
          due: false,
        }
      : application.appliedOn
        ? {
            icon: CalendarDays,
            text: `Applied · ${shortDate(application.appliedOn)}`,
            due: false,
          }
        : {
            icon: HistoryIcon,
            text: `Updated · ${shortDate(application.updatedAt)}`,
            due: false,
          };
  const MilestoneIcon = milestone.icon;
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- drag source and reader trigger; the title button opens the same reader from the keyboard, the chip menu covers touch
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", application.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStateChange(application.id);
      }}
      onDragEnd={() => onDragStateChange(null)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        onOpen(application);
      }}
      className={`group relative rounded-md border bg-background px-2.5 py-2 shadow-xs transition-colors ${
        selected
          ? "border-brand/60"
          : "border-border hover:border-border-strong"
      } ${dragging ? "opacity-50" : ""}`}
    >
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 opacity-0 shadow-xs backdrop-blur-[2px] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        {sourceUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${application.title} posting in browser`}
                title="Open posting"
                className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:size-11"
              >
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">Open posting</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${application.title}`}
              className="size-6 rounded-sm text-muted-foreground hover:text-foreground [@media(hover:none)]:size-11"
              onClick={() => onEdit(application)}
            >
              <SquarePen aria-hidden="true" strokeWidth={1.8} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${application.title}`}
              className="size-6 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive [@media(hover:none)]:size-11"
              onClick={() => onDelete(application)}
            >
              <Trash2 aria-hidden="true" strokeWidth={1.8} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete</TooltipContent>
        </Tooltip>
      </div>
      <button
        type="button"
        className="block w-full truncate rounded-sm pr-16 text-left text-[13px] font-medium leading-snug text-foreground underline-offset-4 hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View details for ${application.title}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(application)}
      >
        {application.title}
      </button>
      <p className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
        <Building2 aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{application.companyName}</span>
        {application.type ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{application.type}</span>
          </>
        ) : null}
      </p>
      {application.location || compensation ? (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
          {application.location ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{application.location}</span>
            </span>
          ) : null}
          {application.location && compensation ? (
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
          ) : null}
          {compensation ? (
            <span className="flex min-w-0 items-center gap-1">
              <Banknote aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{compensation}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <StatusMenuChip
            status={application.status}
            label={application.title}
            disabled={isSaving}
            onMove={(status) => onMove(application, status)}
          />
        </span>
        <span
          title={milestone.text}
          className={`flex shrink-0 items-center gap-1 text-[11px] tabular-nums ${
            milestone.due ? "text-[var(--warning)]" : "text-muted-foreground"
          }`}
        >
          <MilestoneIcon aria-hidden="true" className="size-3" />
          {milestone.text}
        </span>
      </div>
    </article>
  );
}

function StatusMenuChip({
  status,
  label,
  disabled,
  onMove,
}: {
  status: string;
  label: string;
  disabled: boolean;
  onMove: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Change status for ${label}. Current status: ${status}.`}
          aria-expanded={open}
          className={`status-pill ${statusTone(status)} min-h-6 cursor-pointer rounded-md border border-border/70 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:min-h-9`}
        >
          {status}
          <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">
          Move to stage
        </p>
        {applicationStatuses.map((stage) => (
          <button
            key={stage}
            type="button"
            className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-sm text-foreground hover:bg-hover [@media(hover:none)]:min-h-11"
            onClick={() => {
              setOpen(false);
              onMove(stage);
            }}
          >
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${statusDotClass(stage)}`}
            />
            <span className="flex-1 text-left">{stage}</span>
            {stage === status && (
              <Check
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function RowActions({
  label,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  label: string;
  onStatusChange: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Actions for ${label}`}
      className="flex items-center justify-end gap-1"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Change status for ${label}`}
            className="size-8 rounded-lg border-border/70 bg-background text-muted-foreground shadow-xs hover:border-border-strong hover:bg-muted hover:text-foreground [@media(hover:none)]:size-11"
            onClick={onStatusChange}
          >
            <CircleDot aria-hidden="true" strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Change status</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Edit ${label}`}
            className="size-8 rounded-lg border-border/70 bg-background text-muted-foreground shadow-xs hover:border-border-strong hover:bg-muted hover:text-foreground [@media(hover:none)]:size-11"
            onClick={onEdit}
          >
            <SquarePen aria-hidden="true" strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Edit {label}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Delete ${label}`}
            className="size-8 rounded-lg border-border/70 bg-background text-muted-foreground shadow-xs hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive [@media(hover:none)]:size-11"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" strokeWidth={1.8} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Delete {label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function StatusChangeDialog({
  target,
  isSaving,
  onOpenChange,
  onSave,
}: {
  target: StatusTarget;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (status: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(target.status);
  const [error, setError] = useState("");
  const options =
    target.kind === "applications" ? applicationStatuses : companyStatuses;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onSave(status);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update status.",
      );
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
          <DialogDescription>
            Update the status for{" "}
            <span className="font-medium text-foreground">{target.label}</span>.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Status
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                aria-label={`${target.kind === "applications" ? "Application" : "Company"} status`}
                className={touchInputClass}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className={touchSelectItemClass}
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || status === target.status}
            >
              {isSaving ? <RefreshCw className="animate-spin" /> : null}
              {isSaving ? "Saving…" : "Save status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SaveForm = (
  id: string | undefined,
  body: Record<string, unknown>,
) => Promise<unknown>;

function ApplicationEditorSheet({
  item,
  companies,
  defaultCompanyId,
  isSaving,
  onOpenChange,
  onSave,
}: {
  item: Application | null;
  companies: Company[];
  defaultCompanyId: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: SaveForm;
}) {
  const [form, setForm] = useState(() =>
    item
      ? {
          title: item.title,
          companyId: item.companyId,
          status: item.status,
          type: item.type ?? "",
          description: item.description,
          location: item.location,
          employmentType: item.employmentType,
          workMode: item.workMode === "unknown" ? "" : item.workMode,
          compensation: item.compensation,
          links: postingLinksOf(item.sourceUrl),
          appliedOn: item.appliedOn ?? "",
          contactedOn: item.contactedOn ?? "",
          followUpOn: item.followUpOn ?? "",
          contactName: item.contactName,
          contactEmail: item.contactEmail,
          channels: item.channels,
          outcome: item.outcome,
          notes: item.notes,
        }
      : {
          title: "",
          companyId: defaultCompanyId,
          status: "To apply",
          type: "",
          description: "",
          location: "",
          employmentType: "",
          workMode: "",
          compensation: "",
          links: [""],
          appliedOn: "",
          contactedOn: "",
          followUpOn: "",
          contactName: "",
          contactEmail: "",
          channels: "",
          outcome: "",
          notes: "",
        },
  );
  const [error, setError] = useState("");
  const primaryInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      status: form.status,
      type: form.type || null,
      description: form.description.trim(),
      location: form.location.trim(),
      employmentType: form.employmentType.trim(),
      workMode: form.workMode || "unknown",
      compensation: form.compensation.trim(),
      sourceUrl: form.links
        .map((link) => link.trim())
        .filter(Boolean)
        .join("\n"),
      appliedOn: form.appliedOn || null,
      contactedOn: form.contactedOn || null,
      followUpOn: form.followUpOn || null,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      channels: form.channels.trim(),
      outcome: form.outcome.trim(),
      notes: form.notes.trim(),
    };
    if (!item) body.companyId = form.companyId;
    const invalidLink = form.links.find(
      (link) => link.trim() && !safeHttpUrl(link.trim()),
    );
    if (invalidLink) {
      setError("Posting links must be valid HTTP or HTTPS URLs.");
      return;
    }
    try {
      await onSave(item?.id, body);
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save application.",
      );
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        className="inset-y-0 right-0 flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-2xl sm:max-w-[600px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          primaryInputRef.current?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-5 pr-16 text-left">
          <SheetTitle className="text-xl tracking-tight">
            {item ? "Edit application" : "Add application"}
          </SheetTitle>
          <SheetDescription className="mt-1 max-w-[48ch] leading-relaxed">
            {item
              ? "Update the opportunity details. Its company stays fixed."
              : "Record an opportunity and select its company."}
          </SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5">
              <div className="border-b border-border/70 pb-3">
                <h3 className="text-sm font-semibold">Role details</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The posting, company, and current stage.
                </p>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Opportunity
                <Input
                  ref={primaryInputRef}
                  required
                  className={touchInputClass}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  maxLength={200}
                />
              </label>
              <div className="grid gap-2 text-sm font-medium">
                <span>Company</span>
                {item ? (
                  <span className="flex h-8 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-normal text-muted-foreground [@media(hover:none)]:h-11 [@media(hover:none)]:text-base">
                    {item.companyName}
                  </span>
                ) : (
                  <Select
                    required
                    value={form.companyId}
                    onValueChange={(companyId) =>
                      setForm({ ...form, companyId })
                    }
                  >
                    <SelectTrigger
                      aria-label="Company"
                      className={touchInputClass}
                    >
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem
                          key={company.id}
                          value={company.id}
                          className={touchSelectItemClass}
                        >
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Status
                  <Select
                    value={form.status}
                    onValueChange={(status) => setForm({ ...form, status })}
                  >
                    <SelectTrigger
                      aria-label="Application status"
                      className={touchInputClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {applicationStatuses.map((status) => (
                        <SelectItem
                          key={status}
                          value={status}
                          className={touchSelectItemClass}
                        >
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Type
                  <Select
                    value={form.type || "none"}
                    onValueChange={(type) =>
                      setForm({ ...form, type: type === "none" ? "" : type })
                    }
                  >
                    <SelectTrigger
                      aria-label="Application type"
                      className={touchInputClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className={touchSelectItemClass}>
                        No type
                      </SelectItem>
                      <SelectItem value="Job" className={touchSelectItemClass}>
                        Job
                      </SelectItem>
                      <SelectItem
                        value="Intern"
                        className={touchSelectItemClass}
                      >
                        Intern
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="grid gap-2 text-sm font-medium">
                <span>Posting links</span>
                <div className="grid gap-2">
                  {form.links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="url"
                        className={touchInputClass}
                        value={link}
                        aria-label={`Posting link ${index + 1}`}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            links: form.links.map((value, position) =>
                              position === index ? event.target.value : value,
                            ),
                          })
                        }
                        placeholder="https://"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground [@media(hover:none)]:size-11"
                        aria-label={`Remove posting link ${index + 1}`}
                        disabled={form.links.length === 1}
                        onClick={() =>
                          setForm({
                            ...form,
                            links: form.links.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit [@media(hover:none)]:h-11"
                    onClick={() =>
                      setForm({ ...form, links: [...form.links, ""] })
                    }
                  >
                    <Plus /> Add link
                  </Button>
                </div>
              </div>
              <div className="border-b border-border/70 pb-3 pt-2">
                <h3 className="text-sm font-semibold">Work details</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Location, arrangement, and compensation.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Location
                  <Input
                    className={touchInputClass}
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    maxLength={500}
                    placeholder="City, country, or remote region"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Employment type
                  <Input
                    className={touchInputClass}
                    value={form.employmentType}
                    onChange={(event) =>
                      setForm({ ...form, employmentType: event.target.value })
                    }
                    maxLength={120}
                    placeholder="Full-time, internship…"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Work mode
                  <Select
                    value={form.workMode || "unknown"}
                    onValueChange={(workMode) =>
                      setForm({
                        ...form,
                        workMode: workMode === "unknown" ? "" : workMode,
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label="Work mode"
                      className={touchInputClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="unknown"
                        className={touchSelectItemClass}
                      >
                        Not specified
                      </SelectItem>
                      <SelectItem
                        value="remote"
                        className={touchSelectItemClass}
                      >
                        Remote
                      </SelectItem>
                      <SelectItem
                        value="hybrid"
                        className={touchSelectItemClass}
                      >
                        Hybrid
                      </SelectItem>
                      <SelectItem
                        value="onsite"
                        className={touchSelectItemClass}
                      >
                        On-site
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Compensation
                  <Input
                    className={touchInputClass}
                    value={form.compensation}
                    onChange={(event) =>
                      setForm({ ...form, compensation: event.target.value })
                    }
                    maxLength={500}
                    placeholder="₹24–32 LPA, $145k–185k / year…"
                  />
                </label>
              </div>
              <div className="border-b border-border/70 pb-3 pt-2">
                <h3 className="text-sm font-semibold">Timeline</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Track when you applied and when to follow up.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2 text-sm font-medium">
                  <span>Applied on</span>
                  <TrackerDatePicker
                    value={form.appliedOn}
                    onChange={(appliedOn) => setForm({ ...form, appliedOn })}
                  />
                </div>
                <div className="grid gap-2 text-sm font-medium">
                  <span>Last contacted</span>
                  <TrackerDatePicker
                    value={form.contactedOn}
                    onChange={(contactedOn) =>
                      setForm({ ...form, contactedOn })
                    }
                  />
                </div>
                <div className="grid gap-2 text-sm font-medium">
                  <span>Follow-up</span>
                  <TrackerDatePicker
                    value={form.followUpOn}
                    onChange={(followUpOn) => setForm({ ...form, followUpOn })}
                  />
                </div>
              </div>
              <div className="border-b border-border/70 pb-3 pt-2">
                <h3 className="text-sm font-semibold">Contact</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save the people involved in the conversation.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Contact name
                  <Input
                    className={touchInputClass}
                    value={form.contactName}
                    onChange={(event) =>
                      setForm({ ...form, contactName: event.target.value })
                    }
                    maxLength={200}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Contact email
                  <Input
                    type="email"
                    className={touchInputClass}
                    value={form.contactEmail}
                    onChange={(event) =>
                      setForm({ ...form, contactEmail: event.target.value })
                    }
                    maxLength={320}
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Channels used
                <Input
                  className={touchInputClass}
                  value={form.channels}
                  onChange={(event) =>
                    setForm({ ...form, channels: event.target.value })
                  }
                  maxLength={4000}
                  placeholder="Careers page, Email, Job board, LinkedIn…"
                />
              </label>
              <div className="border-b border-border/70 pb-3 pt-2">
                <h3 className="text-sm font-semibold">Description and notes</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep the original posting and your own outcome notes.
                </p>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Job description
                <Textarea
                  className={touchTextareaClass}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  maxLength={100000}
                  rows={7}
                  placeholder="Paste or save the job description here."
                />
              </label>
              <div className="grid gap-2 text-sm font-medium">
                <span>Outcome</span>
                <Select
                  value={form.outcome || "none"}
                  onValueChange={(outcome) =>
                    setForm({
                      ...form,
                      outcome: outcome === "none" ? "" : outcome,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Outcome"
                    className={touchInputClass}
                  >
                    <SelectValue placeholder="No outcome yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className={touchSelectItemClass}>
                      No outcome yet
                    </SelectItem>
                    {outcomeOptions.includes(form.outcome) ||
                    !form.outcome ? null : (
                      <SelectItem
                        value={form.outcome}
                        className={touchSelectItemClass}
                      >
                        {form.outcome}
                      </SelectItem>
                    )}
                    {outcomeOptions.map((outcome) => (
                      <SelectItem
                        key={outcome}
                        value={outcome}
                        className={touchSelectItemClass}
                      >
                        {outcome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Notes
                <Textarea
                  className={touchTextareaClass}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={3}
                />
              </label>
            </div>
          </div>
          {error && (
            <p
              className="mx-6 mb-2 shrink-0 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="[@media(hover:none)]:h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="[@media(hover:none)]:h-11"
              disabled={isSaving || !form.companyId}
            >
              {isSaving ? "Saving…" : item ? "Save changes" : "Add application"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CompanyEditorSheet({
  item,
  isSaving,
  onOpenChange,
  onSave,
}: {
  item: Company | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: SaveForm;
}) {
  const [form, setForm] = useState(() =>
    item
      ? {
          name: item.name,
          website: item.website,
          location: item.location,
          description: item.description,
          contacts: item.contacts,
          status: item.status,
          notes: item.notes,
        }
      : {
          name: "",
          website: "",
          location: "",
          description: "",
          contacts: "",
          status: "Listed",
          notes: "",
        },
  );
  const [error, setError] = useState("");
  const primaryInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      name: form.name.trim(),
      website: form.website.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      contacts: form.contacts.trim(),
      status: form.status,
      notes: form.notes.trim(),
    };
    try {
      await onSave(item?.id, body);
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save company.",
      );
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        className="inset-y-0 right-0 flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-2xl sm:max-w-[520px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          primaryInputRef.current?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-5 pr-16 text-left">
          <SheetTitle className="text-xl tracking-tight">
            {item ? "Edit company" : "Add company"}
          </SheetTitle>
          <SheetDescription className="mt-1 max-w-[48ch] leading-relaxed">
            Keep company details and notes together.
          </SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5">
              <div className="border-b border-border/70 pb-3">
                <h3 className="text-sm font-semibold">Company profile</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep the basic details you use to recognize this company.
                </p>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Company name
                <Input
                  ref={primaryInputRef}
                  required
                  className={touchInputClass}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  maxLength={200}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Website
                <Input
                  type="url"
                  className={touchInputClass}
                  placeholder="https://"
                  value={form.website}
                  onChange={(event) =>
                    setForm({ ...form, website: event.target.value })
                  }
                  maxLength={2048}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Location
                  <Input
                    className={touchInputClass}
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Company status
                  <Select
                    value={form.status}
                    onValueChange={(status) => setForm({ ...form, status })}
                  >
                    <SelectTrigger
                      aria-label="Company status"
                      className={touchInputClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {companyStatuses.map((status) => (
                        <SelectItem
                          key={status}
                          value={status}
                          className={touchSelectItemClass}
                        >
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Description
                <Textarea
                  className={touchTextareaClass}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={3}
                  placeholder="What the company does, if known."
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Contacts
                <Input
                  className={touchInputClass}
                  value={form.contacts}
                  onChange={(event) =>
                    setForm({ ...form, contacts: event.target.value })
                  }
                  maxLength={4000}
                  placeholder="People at the company, from Notion or your research."
                />
              </label>
              <div className="border-b border-border/70 pb-3 pt-2">
                <h3 className="text-sm font-semibold">Notes</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a status and anything you want to remember.
                </p>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Notes
                <Textarea
                  className={touchTextareaClass}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={4}
                />
              </label>
            </div>
          </div>
          {error && (
            <p
              className="mx-6 mb-2 shrink-0 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="[@media(hover:none)]:h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="[@media(hover:none)]:h-11"
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : item ? "Save changes" : "Add company"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

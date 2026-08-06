import { useState, type ReactNode } from "react";
import {
  Building2,
  ChevronsUpDown,
  Download,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "ledger", label: "Ledger", icon: Receipt },
  { id: "budgets", label: "Budgets", icon: Target },
  { id: "import", label: "Import", icon: Download },
];

interface AppShellProps {
  readonly activeView: string;
  readonly onNavigate: (view: string) => void;
  readonly children: ReactNode;
}

export function AppShell({
  activeView,
  onNavigate,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]"
      style={{ background: "var(--ink)" }}
    >
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function Sidebar({
  activeView,
  onNavigate,
}: Omit<AppShellProps, "children">): JSX.Element {
  const { signOut, session } = useAuth();

  return (
    <aside
      className="flex flex-col border-b lg:border-b-0 lg:border-r lg:h-screen lg:sticky lg:top-0"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <div
        className="px-5 py-5 border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <div className="display text-[15px] font-bold tracking-tight">
          Ledger
        </div>
        <div className="eyebrow mt-0.5">Cash intelligence</div>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex-1 px-3 py-3" aria-label="Sections">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeView;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13px] transition-colors"
                  style={{
                    background: isActive
                      ? "var(--surface-raised)"
                      : "transparent",
                    color: isActive ? "var(--parchment)" : "var(--graphite)",
                  }}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {item.label}
                  {isActive && (
                    <span
                      className="ml-auto h-3.5 w-px"
                      style={{ background: "var(--gold)" }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className="px-3 py-3 border-t"
        style={{ borderColor: "var(--rule)" }}
      >
        <div className="px-2 pb-2">
          <div className="text-[12.5px]" style={{ color: "var(--parchment)" }}>
            {session?.user.name ?? "—"}
          </div>
          <div className="eyebrow">{session?.user.role ?? "guest"}</div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13px]"
          style={{ color: "var(--graphite)" }}
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function WorkspaceSwitcher(): JSX.Element {
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="px-3 py-3 border-b" style={{ borderColor: "var(--rule)" }}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={`Workspace: ${activeWorkspace?.name ?? "none"}. Change workspace`}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded border text-left"
        style={{
          borderColor: "var(--rule)",
          background: "var(--surface-raised)",
        }}
      >
        {activeWorkspace?.kind === "business" ? (
          <Building2
            size={15}
            style={{ color: "var(--gold)" }}
            strokeWidth={1.75}
          />
        ) : (
          <User
            size={15}
            style={{ color: "var(--inflow)" }}
            strokeWidth={1.75}
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className="block text-[13px] truncate"
            style={{ color: "var(--parchment)" }}
          >
            {activeWorkspace?.name ?? "Select workspace"}
          </span>
          <span className="eyebrow figure">
            {activeWorkspace?.baseCurrency ?? "—"}
          </span>
        </span>
        <ChevronsUpDown size={13} style={{ color: "var(--graphite)" }} />
      </button>

      {isOpen && (
        <ul
          className="mt-1 rounded border overflow-hidden"
          style={{ borderColor: "var(--rule)" }}
          role="listbox"
        >
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                role="option"
                aria-selected={workspace.id === activeWorkspace?.id}
                onClick={() => {
                  switchWorkspace(workspace.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left"
                style={{
                  color:
                    workspace.id === activeWorkspace?.id
                      ? "var(--parchment)"
                      : "var(--graphite)",
                  background:
                    workspace.id === activeWorkspace?.id
                      ? "var(--surface-raised)"
                      : "transparent",
                }}
              >
                {workspace.kind === "business" ? (
                  <Building2 size={14} />
                ) : (
                  <User size={14} />
                )}
                {workspace.name}
                <span className="ml-auto eyebrow figure">
                  {workspace.baseCurrency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TopBarProps {
  readonly title: string;
  readonly subtitle: string;
  readonly rangeDays: number;
  readonly onRangeChange: (days: number) => void;
  readonly isRefreshing: boolean;
  readonly onAddTransaction: () => void;
}

const RANGES: readonly number[] = [7, 30, 90, 365];

export function TopBar({
  title,
  subtitle,
  rangeDays,
  onRangeChange,
  isRefreshing,
  onAddTransaction,
}: TopBarProps): JSX.Element {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-4 px-6 py-5 border-b"
      style={{ borderColor: "var(--rule)" }}
    >
      <div>
        <h1 className="display text-[22px] font-semibold leading-none">
          {title}
        </h1>
        <p className="eyebrow mt-2">
          {subtitle}
          {isRefreshing && <span className="ml-2 opacity-60">updating…</span>}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex rounded border overflow-hidden"
          style={{ borderColor: "var(--rule)" }}
          role="group"
          aria-label="Date range"
        >
          {RANGES.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onRangeChange(days)}
              aria-pressed={days === rangeDays}
              className="figure px-3 py-1.5 text-[12px]"
              style={{
                background:
                  days === rangeDays ? "var(--surface-raised)" : "transparent",
                color:
                  days === rangeDays ? "var(--parchment)" : "var(--graphite)",
              }}
            >
              {days}d
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddTransaction}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: "var(--parchment)", color: "var(--ink)" }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add
        </button>
      </div>
    </header>
  );
}

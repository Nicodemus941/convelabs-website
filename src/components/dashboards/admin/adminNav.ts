import {
  LayoutDashboard, CalendarDays, Inbox, Users, FlaskConical, Building2,
  Receipt, Mail, Briefcase, Crown, Settings,
} from 'lucide-react';

/**
 * ADMIN NAVIGATION — single source of truth.
 *
 * Both AdminSidebar (what you can click) and Dashboard.tsx (what renders) read
 * this file. Before 2026-09-28 they were two independent lists, which is how
 * `users` ended up routed-but-unreachable (a real tab with no nav entry) and
 * `inventory` ended up reachable-but-fake. One list makes that class of bug
 * impossible: a section with no `view` cannot be typed into the URL, and a
 * view with no section cannot be rendered.
 *
 * Shape: /dashboard/<role>/<section>[/<view>]
 *   - 9 operational sections, in the order they're worked during a day.
 *   - `owner` gates whole-business financials (platform owner only).
 *   - `system` holds configuration nobody touches hourly.
 */

export type BadgeKind =
  | 'inbox'      // action items + tasks + unread SMS + unread chat (aggregate)
  | 'labOrders'  // unviewed provider-uploaded orders
  | 'release';   // unread release notes

export type AdminView = {
  /** URL segment. Omit on a section's only view. */
  id: string;
  label: string;
  /** Platform owner only — enforced in the sidebar AND in the router. */
  ownerOnly?: boolean;
  /** Restrict to these roles. Undefined = every admin role. */
  roles?: string[];
  badge?: BadgeKind;
};

export type AdminSection = {
  id: string;
  label: string;
  icon: any;
  /** Empty = the section renders one screen and shows no sub-tab bar. */
  views: AdminView[];
  ownerOnly?: boolean;
  roles?: string[];
  badge?: BadgeKind;
  /** Grouping header in the sidebar. */
  group: 'WORK' | 'BUSINESS';
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: 'today',
    label: 'Today',
    icon: LayoutDashboard,
    group: 'WORK',
    views: [],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: CalendarDays,
    group: 'WORK',
    views: [
      { id: 'calendar', label: 'Calendar' },
      { id: 'appointments', label: 'All appointments' },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: Inbox,
    group: 'WORK',
    badge: 'inbox',
    views: [
      { id: 'action-items', label: 'Needs attention' },
      { id: 'tasks', label: 'Notes & tasks' },
      { id: 'sms', label: 'Patient SMS' },
      { id: 'chat', label: 'Website chat', roles: ['super_admin', 'office_manager'] },
    ],
  },
  {
    id: 'patients',
    label: 'Patients',
    icon: Users,
    group: 'WORK',
    views: [],
  },
  {
    id: 'lab',
    label: 'Lab & specimens',
    icon: FlaskConical,
    group: 'WORK',
    badge: 'labOrders',
    views: [
      { id: 'orders', label: 'Lab orders', badge: 'labOrders' },
      { id: 'specimens', label: 'Specimen tracking' },
    ],
  },
  {
    id: 'partners',
    label: 'Partners',
    icon: Building2,
    group: 'WORK',
    views: [
      { id: 'organizations', label: 'Organizations' },
      { id: 'acquisition', label: 'Acquisition pipeline', roles: ['super_admin'] },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: Receipt,
    group: 'BUSINESS',
    views: [
      { id: 'invoices', label: 'Invoices' },
      { id: 'services', label: 'Services & pricing' },
      { id: 'expenses', label: 'Expenses', ownerOnly: true },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    icon: Mail,
    group: 'BUSINESS',
    views: [],
  },
  {
    id: 'team',
    label: 'Team',
    icon: Briefcase,
    group: 'BUSINESS',
    views: [
      { id: 'staff', label: 'Phlebotomists' },
      // `users` was routed and fully built but had NO nav entry — you could not
      // reach it without typing the URL. This line is the fix.
      { id: 'users', label: 'Portal users', roles: ['super_admin'] },
    ],
  },
  {
    id: 'owner',
    label: 'Owner',
    icon: Crown,
    group: 'BUSINESS',
    ownerOnly: true,
    views: [
      { id: 'overview', label: 'Overview' },
      { id: 'hormozi', label: 'Growth model' },
      { id: 'frank', label: 'Frank (CFO)' },
      { id: 'upgrades', label: 'Upgrades & ROI' },
      { id: 'referrals', label: 'Referrals' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    group: 'BUSINESS',
    roles: ['super_admin', 'office_manager'],
    badge: 'release',
    views: [
      { id: 'settings', label: 'Settings', roles: ['super_admin'] },
      { id: 'operations', label: 'Operations' },
      { id: 'ai-assistant', label: 'AI assistant' },
      { id: 'training', label: 'Training' },
      { id: 'scripts', label: 'Scripts & playbooks' },
      { id: 'whats-new', label: "What's new", badge: 'release' },
      { id: 'documentation', label: 'Documentation', roles: ['super_admin'] },
      { id: 'webhooks', label: 'Webhooks', roles: ['super_admin'] },
    ],
  },
];

/**
 * Old URL -> new URL. Every tab key that ever shipped in the sidebar is here,
 * so bookmarks, emailed links and the ~40 in-app <Link>s that still point at
 * the flat paths keep working instead of bouncing to the dashboard root.
 *
 * `inventory` maps to nothing on purpose: that screen ran on hardcoded needle
 * counts with 2025 restock dates and was never reachable from the nav. It is
 * deleted, and its URL now lands on Today.
 */
export const LEGACY_TAB_REDIRECTS: Record<string, string> = {
  calendar: 'schedule/calendar',
  appointments: 'schedule/appointments',
  notes: 'inbox/tasks',
  sms: 'inbox/sms',
  chatbot: 'inbox/chat',
  'lab-orders': 'lab/orders',
  specimens: 'lab/specimens',
  organizations: 'partners/organizations',
  'provider-acquisition': 'partners/acquisition',
  invoices: 'billing/invoices',
  services: 'billing/services',
  expenses: 'billing/expenses',
  marketing: 'growth',
  staff: 'team/staff',
  users: 'team/users',
  hormozi: 'owner/hormozi',
  frank: 'owner/frank',
  upgrades: 'owner/upgrades',
  referrals: 'owner/referrals',
  settings: 'system/settings',
  operations: 'system/operations',
  'ai-assistant': 'system/ai-assistant',
  training: 'system/training',
  scripts: 'system/scripts',
  documentation: 'system/documentation',
  webhooks: 'system/webhooks',
  'new-updates': 'system/whats-new',
  inventory: '',
};

export const OWNER_ONLY_SECTIONS = new Set(
  ADMIN_SECTIONS.filter(s => s.ownerOnly).map(s => s.id)
);

export function findSection(id: string | undefined): AdminSection | undefined {
  if (!id) return undefined;
  return ADMIN_SECTIONS.find(s => s.id === id);
}

/** The view a section opens on when the URL names no view. */
export function defaultViewId(section: AdminSection, isPlatformOwner: boolean): string | undefined {
  const first = section.views.find(v => !v.ownerOnly || isPlatformOwner);
  return first?.id;
}

export function isViewVisible(view: AdminView, role: string, isPlatformOwner: boolean): boolean {
  if (view.ownerOnly && !isPlatformOwner) return false;
  if (view.roles && !view.roles.includes(role)) return false;
  return true;
}

export function isSectionVisible(section: AdminSection, role: string, isPlatformOwner: boolean): boolean {
  if (section.ownerOnly && !isPlatformOwner) return false;
  if (section.roles && !section.roles.includes(role)) return false;
  // A section whose every view is hidden from this user is itself hidden.
  if (section.views.length > 0) {
    return section.views.some(v => isViewVisible(v, role, isPlatformOwner));
  }
  return true;
}

export const PLATFORM_OWNER_EMAIL = 'nicodemmebaptiste@convelabs.com';

export function checkPlatformOwner(email: string | null | undefined): boolean {
  return (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL.toLowerCase();
}

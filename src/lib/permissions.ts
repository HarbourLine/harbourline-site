import { auth } from "@/auth";

export type Role = "OWNER" | "MANAGER" | "BOOKKEEPER";

// Higher rank = more access. Used by hasRole() / requireRole() so callers can
// say "minimum MANAGER" and get true for OWNER too.
const RANK: Record<Role, number> = {
  OWNER: 3,
  MANAGER: 2,
  BOOKKEEPER: 1,
};

export interface CurrentStaff {
  staffId: string;
  email: string;
  name: string;
  role: Role;
}

// Returns the signed-in staff member (id, email, name, role), or null if no
// session. Pull from the JWT, which is enriched on first lookup by the auth.ts
// jwt callback — no extra DB hit per page render.
export async function currentStaff(): Promise<CurrentStaff | null> {
  const session = await auth();
  const user = session?.user as
    | { email?: string; name?: string; staffId?: string; role?: string }
    | undefined;
  if (!user?.staffId || !user.email || !user.role) return null;
  return {
    staffId: user.staffId,
    email: user.email,
    name: user.name ?? user.email,
    role: user.role as Role,
  };
}

export function hasRole(role: Role | undefined, minRole: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[minRole];
}

// Throws if the caller isn't at least `minRole`. Use in server actions to
// gate writes. For server components, prefer rendering a "Forbidden" panel.
export async function requireRole(minRole: Role): Promise<CurrentStaff> {
  const staff = await currentStaff();
  if (!staff) throw new Error("Not signed in");
  if (!hasRole(staff.role, minRole)) {
    throw new Error(`Forbidden — requires at least ${minRole}`);
  }
  return staff;
}

// Human label for the role enum. Surface in UI.
export function roleLabel(role: Role): string {
  return { OWNER: "Founder", MANAGER: "Practice Manager", BOOKKEEPER: "Team Member" }[role];
}

export function roleDescription(role: Role): string {
  return {
    OWNER:
      "Everything: all clients, all time, all financial data, can promote/demote anyone.",
    MANAGER:
      "All clients, tasks and time, can edit settings and approve absences. Can't see other people's personal HR data.",
    BOOKKEEPER:
      "Own clients + own time + tasks they're assigned to.",
  }[role];
}

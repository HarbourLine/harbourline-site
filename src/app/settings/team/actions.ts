"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentStaff, requireRole, type Role } from "@/lib/permissions";

const VALID_ROLES: Role[] = ["OWNER", "MANAGER", "BOOKKEEPER", "JUNIOR"];

export async function updateRole(formData: FormData) {
  const me = await requireRole("OWNER");
  const staffId = String(formData.get("staffId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!staffId || !VALID_ROLES.includes(role)) return;

  // Refuse to demote the last remaining owner — would lock everyone out.
  if (role !== "OWNER") {
    const target = await prisma.staff.findUnique({ where: { id: staffId } });
    if (target?.role === "OWNER") {
      const ownerCount = await prisma.staff.count({
        where: { role: "OWNER", isActive: true },
      });
      if (ownerCount <= 1) {
        throw new Error("Can't demote the last active Owner — promote someone else first.");
      }
    }
  }

  // Allow self-demotion only if there's another owner to take over.
  if (staffId === me.staffId && role !== "OWNER") {
    const ownerCount = await prisma.staff.count({
      where: { role: "OWNER", isActive: true, NOT: { id: me.staffId } },
    });
    if (ownerCount === 0) {
      throw new Error("Promote another Owner first before demoting yourself.");
    }
  }

  await prisma.staff.update({ where: { id: staffId }, data: { role } });
  revalidatePath("/settings/team");
}

export async function toggleActive(formData: FormData) {
  const me = await requireRole("OWNER");
  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return;
  if (staffId === me.staffId) {
    throw new Error("Can't deactivate your own account.");
  }
  const target = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!target) return;

  // Same last-owner protection: don't allow deactivating the only active owner.
  if (target.role === "OWNER" && target.isActive) {
    const ownerCount = await prisma.staff.count({
      where: { role: "OWNER", isActive: true },
    });
    if (ownerCount <= 1) {
      throw new Error("Can't deactivate the last active Owner.");
    }
  }

  await prisma.staff.update({
    where: { id: staffId },
    data: {
      isActive: !target.isActive,
      leftDate: target.isActive ? new Date() : null,
    },
  });
  revalidatePath("/settings/team");
}

export async function getCurrentMe() {
  return currentStaff();
}

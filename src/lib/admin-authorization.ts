import { canAccessAdminFeature, type BookingPermission } from "@/lib/admin-permissions";

export type AdminPermission = BookingPermission;

type AdminUser = { role: string; permissions?: string[] };

export function hasAdminPermission(user: AdminUser, permission: AdminPermission) {
  if (user.role === "admin") return true;

  if (permission === "bookings_view") {
    return (
      user.permissions?.includes("bookings_view") === true ||
      canAccessAdminFeature(user.role, user.permissions, "bookings")
    );
  }

  return user.permissions?.includes(permission) === true;
}

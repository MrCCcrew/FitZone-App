import {
  canAccessAdminFeature,
  type BookingPermission,
  type MarketingPermission,
  type EmployeePermission,
} from "@/lib/admin-permissions";

export type AdminPermission =
  BookingPermission | MarketingPermission | EmployeePermission;

type AdminUser = { role: string; permissions?: string[] };

export function hasAdminPermission(
  user: AdminUser,
  permission: AdminPermission,
) {
  if (user.role === "admin") return true;

  if (permission === "bookings_view") {
    return (
      user.permissions?.includes("bookings_view") === true ||
      canAccessAdminFeature(user.role, user.permissions, "bookings")
    );
  }

  if (permission === "employees_view") {
    return (
      user.permissions?.includes("employees_view") === true ||
      canAccessAdminFeature(user.role, user.permissions, "employees")
    );
  }

  return user.permissions?.includes(permission) === true;
}

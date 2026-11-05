import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-font">{children}</div>;
}

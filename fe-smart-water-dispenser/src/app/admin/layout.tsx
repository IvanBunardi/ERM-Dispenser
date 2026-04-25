import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eco-Flow Admin — Dashboard",
  description: "Monitor and control Eco-Flow smart dispenser stations",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-layout-wrapper">
      {children}
    </div>
  );
}

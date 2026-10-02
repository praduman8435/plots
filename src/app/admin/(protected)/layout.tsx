import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminNavCounts } from "@/components/admin/data";
import { requireAdmin } from "@/lib/admin/require";

export default async function ProtectedAdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const counts = await getAdminNavCounts();
  return (
    <AdminShell admin={{ name: admin.name, email: admin.email }} counts={counts}>
      {children}
    </AdminShell>
  );
}

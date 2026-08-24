import { requireUser } from "@/lib/auth";
import { visibleNav } from "@/components/nav-config";
import { Sidebar } from "@/components/sidebar";
import { logout } from "@/app/(auth)/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={visibleNav(user.role)}
        user={{ name: user.name, jobTitle: user.jobTitle, avatarUrl: user.avatarUrl }}
        logoutAction={logout}
      />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}

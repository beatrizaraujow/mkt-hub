import { requireUser } from "@/lib/auth";
import { visibleNav } from "@/components/nav-config";
import { Sidebar } from "@/components/sidebar";
import { logout } from "@/app/(auth)/login/actions";
import { runningTimer } from "@/features/time/queries";
import { temRotinaPropria } from "@/features/routines/queries";
import { podeVerRevisor } from "@/features/review/acesso";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [running, temRotina, ehRevisor] = await Promise.all([
    runningTimer(user.id),
    temRotinaPropria(user),
    podeVerRevisor(user),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={visibleNav(user.role, { temRotina, ehRevisor })}
        user={{ name: user.name, jobTitle: user.jobTitle, avatarUrl: user.avatarUrl }}
        running={running}
        logoutAction={logout}
      />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}

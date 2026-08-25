import type { Metadata } from "next";
import { assertCanManage, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { companyOptions, listPeople } from "@/features/people/queries";
import { PeopleList } from "@/features/people/people-list";

export const metadata: Metadata = { title: "Time · MKT Hub" };
export const dynamic = "force-dynamic";

export default async function TimePage() {
  const user = await requireUser();
  assertCanManage(user);

  const [people, companies] = await Promise.all([listPeople(user), companyOptions(user)]);

  return (
    <>
      <PageHeader
        title="Time"
        description="Quem entra, com que papel e em quais empresas."
      />

      <div className="max-w-[820px] px-5 py-5 md:px-7">
        <PeopleList
          people={people}
          companies={companies}
          meId={user.id}
          canCreateAdmin={user.role === "admin"}
        />
      </div>
    </>
  );
}

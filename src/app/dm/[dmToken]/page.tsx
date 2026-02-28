import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { DMDashboard } from "@/components/DMDashboard";

export default async function DMPage({
  params,
}: {
  params: Promise<{ dmToken: string }>;
}) {
  const { dmToken } = await params;

  const session = await prisma.session.findUnique({
    where: { dmToken },
    select: { joinCode: true, dmToken: true },
  });

  if (!session) {
    notFound();
  }

  return <DMDashboard joinCode={session.joinCode} dmToken={session.dmToken} />;
}

import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PlayerView } from "@/components/PlayerView";
import { DashboardView } from "@/components/DashboardView";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ joinCode: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { joinCode } = await params;
  const { mode } = await searchParams;

  const session = await prisma.session.findUnique({
    where: { joinCode: joinCode.toUpperCase() },
    select: { joinCode: true },
  });

  if (!session) {
    notFound();
  }

  if (mode === "dashboard") {
    return <DashboardView joinCode={session.joinCode} />;
  }

  return <PlayerView joinCode={session.joinCode} />;
}

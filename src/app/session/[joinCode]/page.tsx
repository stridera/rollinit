import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PlayerView } from "@/components/PlayerView";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ joinCode: string }>;
}) {
  const { joinCode } = await params;

  const session = await prisma.session.findUnique({
    where: { joinCode: joinCode.toUpperCase() },
    select: { joinCode: true },
  });

  if (!session) {
    notFound();
  }

  return <PlayerView joinCode={session.joinCode} />;
}

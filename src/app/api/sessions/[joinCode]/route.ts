import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ joinCode: string }> }
) {
  const { joinCode } = await params;

  const session = await prisma.session.findUnique({
    where: { joinCode: joinCode.toUpperCase() },
    select: { joinCode: true, createdAt: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ valid: true, joinCode: session.joinCode });
}

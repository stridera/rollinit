import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ joinCode: string }> }
) {
  const { joinCode } = await params;
  const body = await request.json();
  const { password } = body;

  const session = await prisma.session.findUnique({
    where: { joinCode: joinCode.toUpperCase() },
    select: { password: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  if (session.password && session.password !== password) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401 }
    );
  }

  return NextResponse.json({ valid: true });
}

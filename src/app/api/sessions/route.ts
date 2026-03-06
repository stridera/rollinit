import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateJoinCode } from "@/lib/joinCode";
import { createId } from "@paralleldrive/cuid2";

export async function POST() {
  // Clean up stale sessions (30 days inactive)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.session.deleteMany({
    where: { lastActiveAt: { lt: thirtyDaysAgo } },
  });

  // Get all used codes to pick an available one
  const usedCodes = new Set(
    (await prisma.session.findMany({ select: { joinCode: true } })).map(
      (s) => s.joinCode
    )
  );

  let joinCode: string;
  try {
    joinCode = generateJoinCode(usedCodes);
  } catch {
    return NextResponse.json(
      { error: "Could not generate unique join code" },
      { status: 500 }
    );
  }

  const dmToken = createId();

  const session = await prisma.session.create({
    data: {
      joinCode,
      dmToken,
    },
  });

  return NextResponse.json({
    joinCode: session.joinCode,
    dmToken: session.dmToken,
  });
}

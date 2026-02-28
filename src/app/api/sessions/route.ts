import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateJoinCode } from "@/lib/joinCode";
import { createId } from "@paralleldrive/cuid2";

export async function POST() {
  // Generate unique join code (retry on collision)
  let joinCode: string;
  let attempts = 0;
  do {
    joinCode = generateJoinCode();
    const existing = await prisma.session.findUnique({
      where: { joinCode },
    });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
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

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The browser crops and shrinks the photo to a 256px square before upload,
 * which lands around 15–40 KB. The cap leaves headroom while keeping a user
 * document far below MongoDB's 16 MB limit.
 */
const MAX_AVATAR_BYTES = 300 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

function userIdFrom(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/**
 * GET /api/settings/avatar → { avatar: "data:image/…" | null }
 *
 * Kept out of the JWT and the login response: it is far too big for a token
 * and only the header and settings page need it.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const userId = userIdFrom(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ _id: userId }, { projection: { avatar: 1 } });

    return NextResponse.json({ avatar: (user?.avatar as string) ?? null });
  } catch (error) {
    console.error("Get avatar error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** PUT /api/settings/avatar { image: "data:image/jpeg;base64,…" } */
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const userId = userIdFrom(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { image?: unknown };
    const image = typeof body.image === "string" ? body.image : "";
    const match = DATA_URL_PATTERN.exec(image);
    if (!match) {
      return NextResponse.json(
        { error: "Please upload a JPEG, PNG or WebP image" },
        { status: 400 }
      );
    }
    // Base64 is 4 chars per 3 bytes.
    const bytes = Math.floor((match[2].length * 3) / 4);
    if (bytes > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "That image is too large. Please choose a smaller one." },
        { status: 413 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection("users")
      .updateOne(
        { _id: userId },
        { $set: { avatar: image, avatarUpdatedAt: new Date() } }
      );
    if (!result.matchedCount) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ avatar: image });
  } catch (error) {
    console.error("Update avatar error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** DELETE /api/settings/avatar → back to initials. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const userId = userIdFrom(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    await db
      .collection("users")
      .updateOne(
        { _id: userId },
        { $unset: { avatar: "", avatarUpdatedAt: "" } }
      );

    return NextResponse.json({ avatar: null });
  } catch (error) {
    console.error("Delete avatar error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

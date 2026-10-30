import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";

// A route handler rather than a server action: an action that deletes the
// session makes Next re-render the current page, which fails on not-found
// pages. A plain POST + redirect is a full page load, which also drops the
// client router's copies of signed-in pages.
export async function POST(request: Request) {
  await deleteSession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

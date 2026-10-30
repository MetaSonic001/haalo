import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo";

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(DEMO_COOKIE);
  return res;
}

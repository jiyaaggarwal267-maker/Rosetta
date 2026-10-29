import { ApiError, preflight, route } from "@/lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Any /api path without a route: a JSON 404 with CORS, like every other error. */
const notFound = route(async () => {
  throw new ApiError("not_found", "There's nothing at this address.");
});

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

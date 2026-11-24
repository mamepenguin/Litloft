import type { NextRequest } from "next/server";

import { ApiStatusError } from "@/lib/apiError";
import { isValidTimeZone, parseSearchQuery } from "@/lib/searchQuery";
import {
  evaluateSmartCollection,
  type SmartCollectionEvalResult,
} from "@/lib/smartCollectionEval";
import {
  createSmartCollectionServerIo,
  fetchSmartFolders,
  forwardedHeaders,
  type SmartFoldersAnswer,
} from "@/lib/smartCollectionServerIo";

function detail(status: number, message: string): Response {
  return Response.json({ detail: message }, { status });
}

/** Absent is `undefined`; anything but a non-negative integer is `null`. */
function integerParam(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

function upstreamFailure(error: unknown): Response {
  if (error instanceof TypeError) return detail(502, "Backend unreachable");
  return detail(500, "Smart collection evaluation failed");
}

function passthrough(answer: Extract<SmartFoldersAnswer, { ok: false }>): Response {
  return new Response(answer.body, {
    status: answer.status,
    headers: answer.contentType ? { "content-type": answer.contentType } : undefined,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const drive = params.get("drive");
  const id = params.get("id");
  if (!drive || !id) return detail(400, "drive and id are required");

  const offset = integerParam(params.get("offset"));
  const limit = integerParam(params.get("limit"));
  if (offset === null || limit === null) {
    return detail(400, "offset and limit must be non-negative integers");
  }

  const tzParam = params.get("tz");
  const timeZone = tzParam === null || tzParam === "" ? null : tzParam;
  if (timeZone !== null && !isValidTimeZone(timeZone)) {
    return detail(400, "Unknown time zone");
  }

  const headers = forwardedHeaders(request.headers);
  const signal = request.signal;

  let lookup: SmartFoldersAnswer;
  try {
    lookup = await fetchSmartFolders(drive, headers, signal);
  } catch (error) {
    return upstreamFailure(error);
  }
  if (!lookup.ok) return passthrough(lookup);

  const folder = lookup.folders.find((entry) => entry.id === id);
  if (!folder) return detail(404, "Smart collection not found");

  const hasAbsoluteModified = (parseSearchQuery(folder.query).modified ?? []).some(
    (token) => token.amount.kind === "absolute",
  );
  if (hasAbsoluteModified && timeZone === null) {
    return detail(400, "tz is required for an absolute modified: date");
  }

  let evaluation: SmartCollectionEvalResult;
  try {
    evaluation = await evaluateSmartCollection(
      {
        drive,
        query: folder.query,
        type: folder.file_type,
        sort: "relevance",
        order: "desc",
        includeSceneClip: false,
        timeZone,
      },
      createSmartCollectionServerIo(headers, signal),
    );
  } catch (error) {
    if (error instanceof ApiStatusError) {
      return detail(error.status === 404 ? 404 : 502, "Smart collection listing failed");
    }
    return upstreamFailure(error);
  }
  const { files, complete } = evaluation;

  const start = offset ?? 0;
  const members = limit === undefined ? files.slice(start) : files.slice(start, start + limit);

  return Response.json({
    id: folder.id,
    name: folder.name,
    query: folder.query,
    file_type: folder.file_type,
    complete,
    total: files.length,
    ...(params.get("ids") === "1"
      ? { ids: members.map((file) => file.id) }
      : { files: members }),
  });
}

import type {
  LitloftClient,
  LitloftRawRequestOptions,
  LitloftRawResponse,
  LitloftRequestOptions,
} from "../client.js";

export interface RecordedCall {
  method: string;
  path: string;
  options?: LitloftRequestOptions;
}

export interface RecordedRawCall {
  method: string;
  path: string;
  options?: LitloftRawRequestOptions;
}

export interface RecordedMultipartCall {
  method: string;
  path: string;
  form: FormData;
}

// A test double standing in for the real HTTP client. The wire-level
// behavior (headers, query serialization, error mapping) is already
// covered by client.test.ts; these fakes let tool tests assert only the
// delta they own: which method/path/body a tool call maps to.
export function fakeClient(
  impl: (call: RecordedCall) => Promise<unknown>,
  rawImpl?: (call: RecordedRawCall) => Promise<LitloftRawResponse>,
  multipartImpl?: (call: RecordedMultipartCall) => Promise<unknown>
): LitloftClient & {
  calls: RecordedCall[];
  rawCalls: RecordedRawCall[];
  multipartCalls: RecordedMultipartCall[];
} {
  const calls: RecordedCall[] = [];
  const rawCalls: RecordedRawCall[] = [];
  const multipartCalls: RecordedMultipartCall[] = [];
  return {
    calls,
    rawCalls,
    multipartCalls,
    async request(method, path, options) {
      const call = { method, path, options };
      calls.push(call);
      return impl(call) as any;
    },
    async requestRaw(method, path, options) {
      const call = { method, path, options };
      rawCalls.push(call);
      if (!rawImpl) {
        throw new Error("requestRaw not stubbed for this test");
      }
      return rawImpl(call);
    },
    async requestMultipart(method, path, form) {
      const call = { method, path, form };
      multipartCalls.push(call);
      if (!multipartImpl) {
        throw new Error("requestMultipart not stubbed for this test");
      }
      return multipartImpl(call) as any;
    },
  };
}

# JSON requests survive a provider that rejects JSON mode

SPEC-ID: SPEC-ADDON-008

Approval:

## Summary

The intelligence addon asks an `openai_compatible` provider for JSON with
`response_format={"type": "json_object"}`. Anthropic's OpenAI-compatible endpoint
(`https://api.anthropic.com/v1`) answers that with HTTP 400
(`response_format.type: Input should be 'json_schema'`), so every JSON feature routed to
such a profile (summaries, auto tags, detailed summaries, chapter suggestions, and the other
`generate_json` callers) fails and writes nothing. After this change, when a JSON request
is rejected with 400 and the same request without `response_format` gets a response, the
client uses that response and stops sending `response_format` for the rest of its life. The
prompts already ask for JSON and the existing parser already extracts it from plain text,
so the feature works against such a provider. This is for the operator who points a profile
at a provider without JSON object mode.

## Required items

### 1. Normal flow

Scope: the fallback and the latch apply to every request `LLMClient._generate_result` sends
with `response_format={"type": "json_object"}`, whichever public method passed it
(`generate_json_result`, `generate_json`, or `generate(..., response_format=...)`). A
`response_format` of any other type is sent as today, is never resent for this reason and
is never stripped by the latch.

1. A worker calls `LLMClient.generate_json_result` (directly or through `generate_json`).
2. The client sends the chat completion with `response_format={"type": "json_object"}`,
   unless this client has already latched that the provider rejects it, in which case the
   field is left out.
3. The provider answers 400. If the request still carries the reasoning opt-in field
   (`extra_body`, present by default because `llm.reasoning` defaults to `"disabled"`), the
   existing reasoning handling runs first, unchanged: it latches the reasoning field as
   rejected and resends without it. This item applies to a 400 on a request that no longer
   carries `extra_body`.
4. The client resends the same request once without `response_format`. Every other field
   (model, messages, temperature, the token limit field) is identical to the rejected
   request, and `extra_body` stays dropped if step 3 dropped it. The 400 that caused the
   resend does not count toward `retry_attempts`, as for the reasoning resend, so the
   resend happens even with `retry_attempts=0`. At most one such resend happens per call.
   Every retry that follows within the call (after a timeout, 429 or 5xx on the resend)
   also goes out without `response_format`. The 400 that caused the resend is logged at
   INFO as "rejected with `response_format`, retrying without it", not as a permanent
   error.
5. If that resend gets a response object back (HTTP 200, whatever its body: JSON, plain
   text, empty or truncated), the client latches "provider rejects `response_format`", logs
   it at INFO, and returns the response to the existing classification and parse path.
6. Later JSON requests on the same client go out without `response_format` from the start
   and send no extra request for it.

Under the default config, on a provider that rejects only `response_format` (Anthropic), the
first JSON call on a client therefore sends three requests: with both fields (400, blamed on
reasoning), with `response_format` only (400), with neither (200). Every later call sends one.

A provider that accepts `response_format` and never answers 400 never reaches step 3, and
its requests are unchanged.

### 2. Failure cases

- The resend without `response_format` also gets 400: the 400 is not about the field. The
  client does not latch, logs the permanent error as today, and returns the request failure
  as today. The next request still sends `response_format`.
- The resend gets any other error (401–404, a retryable error that exhausts its retries, an
  unexpected exception): no latch, the existing handling for that error applies, and the
  next request still sends `response_format`. A retryable error followed by a response
  within the retry budget latches as in step 5.
- The resend's response is not JSON: the existing parse path returns `FAILURE_MALFORMED`, as
  for any provider that ignores JSON mode. The latch is still set.
- The resend's response has an empty body: the latch is set, and the existing "empty body
  under JSON mode" retry in `generate_json_result` does not fire, because the request it
  would send is identical to the one just answered. The call returns
  `JsonGeneration(None, FAILURE_EMPTY)`.
- After the latch, a 200 with an empty body likewise does not trigger the empty-body retry;
  that retry only fires when the empty answer came to a request that carried
  `response_format`. The call returns `JsonGeneration(None, FAILURE_EMPTY)`.
- A 400 for some other reason (for example an oversized prompt) on a provider that does
  support JSON mode: the resend also gets 400, so nothing is latched (first bullet). One
  extra request is spent per such failure.

### 3. States

Per `LLMClient` instance, one boolean: "sends `response_format`" (initial) and
"`response_format` rejected" (latched). The only transition is initial to latched, in
step 5. There is no transition back; a new client (a routing reload builds new clients)
starts in the initial state. The reasoning latch is a separate, existing boolean.

### 4. Data read and written

None in any store. The latch lives in memory on the client. Data written by the callers
(summaries, tag suggestions and so on) is written exactly as today once a completion
parses.

### 5. External services

The configured `openai_compatible` provider. The change adds one request per JSON call that
is rejected while the client is not yet latched, and none after the latch. Slow or down
behavior is the existing retry loop.

### 6. Authorization

None. No endpoint or permission changes. Which drive may use an offhost profile is still
decided by `llm_cloud` before a client is chosen.

### 7. Effect on existing features

- Every caller of `generate_json` / `generate_json_result` on `LLMClient`. On a provider that
  accepts JSON mode nothing changes.
- The empty-body retry in `generate_json_result` is unchanged for requests that carried
  `response_format`, and skipped for those that did not (item 2).
- The reasoning latch is unchanged and runs before this one. On a provider that rejects only
  `response_format` it is set too, because its rule blames any 400 on its field. That drops
  an OpenRouter extension field the provider does not read, so nothing observable changes.
- `_vision_chat` / `generate_video_scene_json` and `chat_with_tools` do not read the new
  latch and keep sending `response_format` exactly as today.
- `OllamaLLMClient` (native ollama API) is not touched. It translates JSON mode to
  `format: "json"` in its own request body, has no 400 fallback, and keeps behaving as today.
- `generate_stream` and the plain-text calls that pass no `response_format` are never
  resent for it and never set the latch.
- The latch applies to every feature routed to the profile until the routing reloads. A
  provider that supports JSON mode but rejects one particular request with 400 and accepts
  it without the field (OpenAI's json_object mode does this when no message mentions JSON)
  would turn JSON mode off for that profile until the reload. Accepted: every JSON prompt
  in the addon asks for JSON in words, and the parser does not depend on JSON mode.

### 8. Error behavior

- The 400 that triggers the resend: one INFO line naming the model, saying the request was
  rejected with `response_format` and is retried without it.
- On latching, one INFO log line naming the model, saying the client continues without
  `response_format`. Concurrent calls issued before the latch is set may each log it once.
- When the resend also fails, the existing log for that failure, unchanged. So an
  unrelated 400 shows one INFO line and then the existing permanent-error WARNING.
- Nothing new is shown in the UI. A feature that failed before now succeeds.

### 9. User-visible behavior

A summary, tag suggestion or other JSON feature routed to a provider without JSON object
mode now produces its result instead of nothing. The first such call per client takes one
or two extra round trips.

### 10. Non-functional

Cost: one extra request for each JSON call rejected before the latch is set (concurrent first
calls on a shared client may each spend one; there is no serialization), none after it, and
one extra request per unrelated 400 on any provider. No size, concurrency or privacy change:
the resend carries the same prompts to the same provider and model.

## Touch points

- `addons/intelligence/app/llm.py`: `LLMClient._generate_result` (the request loop),
  `LLMClient.generate_json_result` (the empty-body retry condition), and the client's
  per-instance state next to the reasoning latch. Submodule; the change is committed in the
  addon repository and the core bumps the pointer.
- `addons/intelligence/tests/test_llm.py`: tests for this behavior.
- `docs/addons/intelligence.md`: the provider list for `openai_compatible` and the paragraph
  on the reasoning field get a sentence each, saying that a provider without JSON object
  mode (Anthropic's OpenAI-compatible endpoint) works and that the addon stops sending
  `response_format` to it for the rest of the run.

## Invariants

I1. A JSON request on an `openai_compatible` client that is answered 400 with
`response_format`, and answered 200 without it, returns that response to the caller's
classification and parse path instead of a request failure.
I2. After I1 has happened once on a client, each later JSON request on that client is sent
without `response_format`, and a call answered 200 sends exactly one request.
I3. A request rejected with 400 both with and without `response_format`, or whose resend
ends in any other error, returns a request failure after at most one resend without
`response_format`, and the next request on that client is again sent with
`response_format`.
I4. On a provider that answers every request 200 with a non-empty body, every JSON request
carries `response_format={"type": "json_object"}` and exactly one request is sent per call.
I5. A 400 to a request that carried no `response_format`, or one of another type than
`json_object`, causes no resend apart from the existing reasoning resend and leaves the
latch unchanged.
I6. Under `reasoning="disabled"`, a provider that rejects only `response_format` makes the
first JSON call send three requests, the last carrying neither `extra_body` nor
`response_format`, and the caller gets that response.
I7. The resend differs from the rejected request only by the absence of `response_format`
(and of `extra_body` when the reasoning handling already dropped it): same client, model,
messages, temperature and token limit.
I8. After the latch, `generate_video_scene_json` and `chat_with_tools` on the same client
still send `response_format={"type": "json_object"}`.
I9. A JSON call whose request carried no `response_format` and was answered 200 with an empty
body sends no further request and returns `FAILURE_EMPTY`.
I10. With `retry_attempts=0`, a 400 with `response_format` is still followed by one resend
without it; and a 400, then a 503 on the resend, then a 200 latches, with neither the
resend nor the retry carrying `response_format`.
## Checked, no action

- **Sending `json_schema` instead.** Anthropic accepts `response_format.type=json_schema`,
  but every caller would need a schema, and other OpenAI-compatible providers differ in
  schema support. Dropping the field relies on what already works: prompt-level JSON
  instructions and `_parse_json_response`.
- **Matching the provider's error text** (`response_format` in the 400 message). Message
  wording is not a contract; the resend-and-observe rule decides from behavior.
- **Changing the reasoning latch's attribution** so it, too, latches only after a successful
  resend. It is set falsely on a provider that rejects only `response_format`, but the field
  it drops is an extension such a provider does not read. Changing it would revise existing
  behavior for no observable gain.
- **`generate_video_scene_json` (vision).** It already resends once without
  `response_format` when the vision request is rejected. It does not use the latch, so it
  spends one extra request per call on such a provider; vision through this path is not in
  use with the Claude profile now.
- **`chat_with_tools` (agentic Ask).** It also sends `response_format`, but agentic Ask is off
  by default and off for the profile that prompted this. Left for a separate change if it is
  ever enabled on such a provider.
- **Serializing concurrent first calls** so only one pays the extra request. The cost is a
  few requests once per client; a lock in the request path is not worth it.
- **Callers that expect a JSON object and get a list.** Without JSON mode a provider may
  return a top-level list. This already happens on providers that ignore JSON mode, and the
  callers already handle a non-dict result (summaries skip with a warning; refine accepts
  both shapes).
- **Client routing.** The resend goes out on the same client inside the same call, so how a
  client is resolved (`app.llm_routing.resolve`, `llm_cloud`) is not touched.
- **Persisting the latch.** A routing reload or restart re-learns it at the cost of one
  request.
- **A stronger latch condition** (a count, or no latch at all). One successful resend is
  taken as enough; the accepted risk is stated in item 7. Without a latch every call on
  such a provider would pay an extra round trip.

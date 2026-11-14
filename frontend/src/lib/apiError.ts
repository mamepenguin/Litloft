/**
 * A failed request whose HTTP status the caller may need to act on.
 *
 * It lives outside `lib/api` so that a module can tell a `409` from another
 * failure without importing the whole API surface, which tests replace.
 */
export class ApiStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The `detail` code of an error body, when the server sent a string. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiStatusError";
  }
}

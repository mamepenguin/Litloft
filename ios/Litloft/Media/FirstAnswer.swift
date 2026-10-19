import Foundation

/// Resumes a continuation with whichever of two answers comes first.
@MainActor
final class FirstAnswer {
    private var continuation: CheckedContinuation<[HTTPCookie], Never>?

    init(_ continuation: CheckedContinuation<[HTTPCookie], Never>) {
        self.continuation = continuation
    }

    func give(_ cookies: [HTTPCookie]) {
        continuation?.resume(returning: cookies)
        continuation = nil
    }
}

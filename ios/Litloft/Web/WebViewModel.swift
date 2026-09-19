import Foundation

@MainActor
@Observable
final class WebViewModel {
    enum State: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: State = .loading
    private(set) var reloadToken = 0
    private(set) var pageColor: PageColor?

    let serverURL: URL

    init(serverURL: URL) {
        self.serverURL = serverURL
    }

    func setPageColor(_ color: PageColor) {
        pageColor = color
    }

    func markLoading() {
        state = .loading
    }

    func markLoaded() {
        state = .loaded
    }

    /// Only the load that is in flight can fail. An error for one already
    /// accounted for — stopped by the shell, replaced by a newer load — says
    /// nothing about what the viewer is looking at.
    func markFailed(_ error: Error) {
        guard state == .loading, !Self.isCancelled(error) else { return }
        state = .failed(message(for: error))
    }

    /// The shell stopped the load itself: the file went to the viewer, or the
    /// address went to another app. Neither leaves a page behind, so what is
    /// already on screen is the answer — and with nothing there, the viewer is
    /// left with a blank app and no way back to the address they typed.
    func markStopped(pageOnScreen: Bool) {
        guard !pageOnScreen else {
            state = .loaded
            return
        }
        state = .failed(String(localized: "There is no page to show at \(serverURL.absoluteString)."))
    }

    func retry() {
        reloadToken += 1
        state = .loading
    }

    /// A cancelled load was replaced by a newer one, which reports its own
    /// outcome. A code alone means nothing: every domain numbers its own errors.
    private static func isCancelled(_ error: Error) -> Bool {
        let error = error as NSError
        return error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled
    }

    private func message(for error: Error) -> String {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain else { return error.localizedDescription }

        switch URLError.Code(rawValue: error.code) {
        case .cannotConnectToHost, .cannotFindHost:
            return String(localized: "Litloft is not answering at \(serverURL.absoluteString).")
        case .notConnectedToInternet, .networkConnectionLost:
            return String(localized: "This device is not on the network.")
        case .timedOut:
            return String(localized: "The server took too long to answer.")
        default:
            return error.localizedDescription
        }
    }
}

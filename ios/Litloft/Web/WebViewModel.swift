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

    let serverURL: URL

    init(serverURL: URL) {
        self.serverURL = serverURL
    }

    func markLoading() {
        state = .loading
    }

    func markLoaded() {
        state = .loaded
    }

    /// A cancelled load means a newer one took over, so the page the viewer
    /// is waiting for is still on its way.
    func markFailed(_ error: Error) {
        guard !Self.isCancelled(error) else { return }
        state = .failed(message(for: error))
    }

    func retry() {
        reloadToken += 1
        state = .loading
    }

    /// A code alone means nothing: every domain numbers its own errors.
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

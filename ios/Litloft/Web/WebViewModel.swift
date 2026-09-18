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

    /// `pageOnScreen` decides how much a stopped load costs the viewer: with a
    /// page up they keep what they were reading, with none this error is all
    /// they would have.
    func markFailed(_ error: Error, pageOnScreen: Bool) {
        guard Self.reaches(error, pageOnScreen: pageOnScreen) else { return }
        state = .failed(message(for: error))
    }

    func retry() {
        reloadToken += 1
        state = .loading
    }

    /// A code alone means nothing: every domain numbers its own errors.
    ///
    /// A cancelled load was replaced by a newer one, which reports its own
    /// outcome. An interrupted frame load is how WebKit reports a load the
    /// shell stopped on its own say-so, by taking the file as a download.
    private static func reaches(_ error: Error, pageOnScreen: Bool) -> Bool {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return false }
        return !(pageOnScreen && error.domain == "WebKitErrorDomain" && error.code == 102)
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

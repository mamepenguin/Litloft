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

    func markFailed(_ error: Error) {
        state = .failed(message(for: error))
    }

    func retry() {
        reloadToken += 1
        state = .loading
    }

    private func message(for error: Error) -> String {
        switch URLError.Code(rawValue: (error as NSError).code) {
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

import Foundation
import Network

/// Answers the first request with a redirect somewhere else, the way a server
/// that hands its visitors to a sign-in elsewhere does.
final class RedirectServer: @unchecked Sendable {
    private let listener: NWListener
    private let destination: String
    private let queue = DispatchQueue(label: "RedirectServer")

    init(to destination: String) throws {
        self.destination = destination
        listener = try NWListener(using: .tcp, on: .any)
        listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
    }

    func start() async throws -> URL {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            listener.stateUpdateHandler = { state in
                if case .ready = state { continuation.resume() }
            }
            listener.start(queue: queue)
        }
        guard let port = listener.port?.rawValue else { throw URLError(.cannotConnectToHost) }
        return URL(string: "http://127.0.0.1:\(port)/")!
    }

    func stop() {
        listener.cancel()
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] _, _, _, _ in
            guard let self else { return }
            let head = [
                "HTTP/1.1 302 Found",
                "Location: \(destination)",
                "Content-Length: 0",
                "Connection: close",
                "", ""
            ].joined(separator: "\r\n")
            connection.send(content: Data(head.utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }
}

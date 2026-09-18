import Foundation
import Network

/// Answers every request the same way: the two shapes a first load can take
/// without ever putting a page on screen.
final class StubServer: @unchecked Sendable {
    enum Answer {
        /// Sends the visitor somewhere else, the way a server that hands them
        /// to a sign-in elsewhere does.
        case redirect(destination: String)
        /// Answers with a file rather than a page.
        case attachment(named: String)
    }

    private let listener: NWListener
    private let answer: Answer
    private let queue = DispatchQueue(label: "StubServer")

    init(_ answer: Answer) throws {
        self.answer = answer
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

    private var head: String {
        switch answer {
        case .redirect(let destination):
            return [
                "HTTP/1.1 302 Found",
                "Location: \(destination)",
                "Content-Length: 0",
                "Connection: close",
                "", ""
            ].joined(separator: "\r\n")
        case .attachment(let name):
            return [
                "HTTP/1.1 200 OK",
                "Content-Type: application/octet-stream",
                "Content-Disposition: attachment; filename=\"\(name)\"",
                "Content-Length: 4",
                "Connection: close",
                "", "data"
            ].joined(separator: "\r\n")
        }
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] _, _, _, _ in
            guard let self else { return }
            // The close says the body is complete; cancelling the connection as
            // soon as the bytes are handed over can cut it short instead.
            connection.send(
                content: Data(head.utf8),
                contentContext: .finalMessage,
                isComplete: true,
                completion: .contentProcessed { _ in }
            )
        }
    }
}

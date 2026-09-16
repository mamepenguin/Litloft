import Foundation
import Network

/// Serves a WAV file over HTTP at twice real time, then stops answering, the
/// way a server that sleeps or loses its drive does. With `outage`, it answers
/// again once that has passed.
final class BreakingStream: @unchecked Sendable {
    private let listener: NWListener
    private let body: Data
    private let cutAfter: TimeInterval
    private let outage: TimeInterval?
    private let queue = DispatchQueue(label: "BreakingStream")
    private var firstRequest: Date?

    init(file: URL, cutAfter: TimeInterval, outage: TimeInterval? = nil) throws {
        body = try Data(contentsOf: file)
        self.cutAfter = cutAfter
        self.outage = outage
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
        return URL(string: "http://127.0.0.1:\(port)/stream.wav")!
    }

    func stop() {
        listener.cancel()
    }

    private var answering: Bool {
        let elapsed = Date().timeIntervalSince(firstRequest ?? Date())
        guard elapsed > cutAfter else { return true }
        guard let outage else { return false }
        return elapsed > cutAfter + outage
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            if firstRequest == nil { firstRequest = Date() }
            guard answering else {
                connection.cancel()
                return
            }
            respond(to: request, on: connection)
        }
    }

    private func respond(to request: String, on connection: NWConnection) {
        var lower = 0
        var upper = body.count - 1
        let range = request.split(separator: "\r\n").first { $0.lowercased().hasPrefix("range:") }
        if let range, let spec = range.split(separator: "=").last {
            let bounds = spec.split(separator: "-", omittingEmptySubsequences: false)
            lower = Int(bounds[0].trimmingCharacters(in: .whitespaces)) ?? 0
            if bounds.count > 1, let end = Int(bounds[1].trimmingCharacters(in: .whitespaces)) {
                upper = min(end, upper)
            }
        }
        let head = [
            range == nil ? "HTTP/1.1 200 OK" : "HTTP/1.1 206 Partial Content",
            "Content-Type: audio/wav",
            "Accept-Ranges: bytes",
            "Content-Length: \(upper - lower + 1)",
            "Content-Range: bytes \(lower)-\(upper)/\(body.count)",
            "Connection: close",
            "", ""
        ].joined(separator: "\r\n")
        connection.send(content: Data(head.utf8), completion: .contentProcessed { _ in })
        send(from: lower, to: upper, on: connection)
    }

    /// 0.2 s of 8 kHz 16-bit audio every 0.1 s.
    private func send(from lower: Int, to upper: Int, on connection: NWConnection) {
        guard lower <= upper, answering else {
            connection.cancel()
            return
        }
        let end = min(lower + 3_200, upper + 1)
        connection.send(content: body.subdata(in: lower..<end), completion: .contentProcessed { [weak self] error in
            guard let self, error == nil else { return }
            queue.asyncAfter(deadline: .now() + 0.1) { self.send(from: end, to: upper, on: connection) }
        })
    }
}

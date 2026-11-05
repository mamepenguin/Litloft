import Foundation
import Network

/// An HTTP server whose answer to each request is decided by the test, and
/// which records every request it receives.
final class ScriptedServer: @unchecked Sendable {
    struct Request: Sendable {
        let method: String
        /// The path as sent, still percent-encoded.
        let path: String
        let query: [String: String]
        let headers: [String: String]
        let body: Data

        func header(_ name: String) -> String? {
            headers[name.lowercased()]
        }

        var json: [String: Any]? {
            (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        }

        /// The named field of a `multipart/form-data` body.
        func formField(_ name: String) -> Data? {
            guard let type = header("content-type"),
                  let range = type.range(of: "boundary=") else { return nil }
            let boundary = String(type[range.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            let delimiter = Data("--\(boundary)".utf8)
            let separator = Data("\r\n\r\n".utf8)
            var cursor = body.startIndex
            while let start = body.range(of: delimiter, in: cursor..<body.endIndex) {
                guard let headEnd = body.range(of: separator, in: start.upperBound..<body.endIndex) else { return nil }
                let head = String(decoding: body[start.upperBound..<headEnd.lowerBound], as: UTF8.self)
                let next = body.range(of: delimiter, in: headEnd.upperBound..<body.endIndex)
                let end = next.map { $0.lowerBound - 2 } ?? body.endIndex
                if head.contains("name=\"\(name)\"") {
                    return body[headEnd.upperBound..<max(end, headEnd.upperBound)]
                }
                cursor = headEnd.upperBound
            }
            return nil
        }
    }

    enum Reply: Sendable {
        case json(Int, String)
        case status(Int)
        /// Holds the connection open and never answers.
        case never
        /// Closes the connection without an answer.
        case drop
        indirect case delayed(Duration, Reply)
    }

    private let listener: NWListener
    private let queue = DispatchQueue(label: "ScriptedServer")
    private let lock = NSLock()
    private var recorded: [Request] = []
    private var held: [NWConnection] = []
    private let handler: @Sendable (Request) -> Reply

    init(_ handler: @escaping @Sendable (Request) -> Reply) throws {
        self.handler = handler
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
        lock.withLock { self.held.forEach { $0.cancel() } }
    }

    var requests: [Request] {
        lock.withLock { self.recorded }
    }

    func requests(_ method: String, _ suffix: String) -> [Request] {
        requests.filter { $0.method == method && $0.path.hasSuffix(suffix) }
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let request = Self.parse(buffer) {
                self.lock.withLock { self.recorded.append(request) }
                self.answer(self.handler(request), on: connection)
            } else if error == nil, !isComplete {
                self.receive(on: connection, buffer: buffer)
            } else {
                connection.cancel()
            }
        }
    }

    private func answer(_ reply: Reply, on connection: NWConnection) {
        switch reply {
        case .never:
            lock.withLock { self.held.append(connection) }
        case .drop:
            connection.cancel()
        case .delayed(let delay, let inner):
            let nanoseconds = delay.components.seconds * 1_000_000_000 + delay.components.attoseconds / 1_000_000_000
            queue.asyncAfter(deadline: .now() + .nanoseconds(Int(nanoseconds))) { [weak self] in
                self?.answer(inner, on: connection)
            }
        case .status(let code):
            send(code, body: "", on: connection)
        case .json(let code, let body):
            send(code, body: body, on: connection)
        }
    }

    private func send(_ code: Int, body: String, on connection: NWConnection) {
        let bytes = Data(body.utf8)
        let head = [
            "HTTP/1.1 \(code) Status",
            "Content-Type: application/json",
            "Content-Length: \(bytes.count)",
            "Connection: close",
            "", ""
        ].joined(separator: "\r\n")
        connection.send(
            content: Data(head.utf8) + bytes,
            contentContext: .finalMessage,
            isComplete: true,
            completion: .contentProcessed { _ in }
        )
    }

    private static func parse(_ buffer: Data) -> Request? {
        guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let head = String(decoding: buffer[..<end.lowerBound], as: UTF8.self)
        var lines = head.components(separatedBy: "\r\n")
        let start = lines.removeFirst().split(separator: " ")
        guard start.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let length = Int(headers["content-length"] ?? "0") ?? 0
        let body = buffer[end.upperBound...]
        guard body.count >= length else { return nil }
        let target = String(start[1])
        let components = URLComponents(string: "http://stub\(target)")
        var query: [String: String] = [:]
        components?.queryItems?.forEach { query[$0.name] = $0.value ?? "" }
        let path = target.split(separator: "?", maxSplits: 1).first.map(String.init) ?? target
        return Request(
            method: String(start[0]),
            path: path,
            query: query,
            headers: headers,
            body: Data(body.prefix(length))
        )
    }
}

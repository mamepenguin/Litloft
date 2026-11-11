import Foundation
import Network
import os

#if !SHARE_EXTENSION
@testable import Litloft
#endif

enum LocalNetworkStatus {
    /// The reason iOS gives when the app's local network permission is off.
    static var denied: Bool {
        let monitor = NWPathMonitor()
        monitor.start(queue: DispatchQueue(label: "litloft.share.path"))
        let path = monitor.currentPath
        monitor.cancel()
        return path.unsatisfiedReason == .localNetworkDenied
    }
}

/// The spec's timeouts, one per request shape.
struct ShareTimeouts: Equatable, Sendable {
    var json: TimeInterval
    var chunk: TimeInterval
    var create: TimeInterval
    var complete: TimeInterval

    static let standard = ShareTimeouts(json: 30, chunk: 120, create: 60, complete: 900)
}

struct ShareResponse: Sendable {
    let status: Int
    let data: Data
}

enum ShareAPIError: Error, Equatable {
    case transport(URLError.Code)
}

struct ShareAuthStatus: Equatable, Sendable {
    var hasProtectedDrives: Bool
    var unlockedGroups: [String]
}

/// Every request the extension makes. A response that reached the server is
/// returned even when it is an error; only transport failures throw.
@MainActor
final class ShareAPIClient {
    let server: URL
    let accessToken: String?
    let viewer: String?
    let timeouts: ShareTimeouts

    private let session: URLSession
    private var inFlight: Task<(Data, URLResponse), Error>?

    init(
        server: URL,
        accessToken: String?,
        viewer: String?,
        timeouts: ShareTimeouts = .standard,
        session: URLSession = .shared
    ) {
        self.server = server
        self.accessToken = accessToken
        self.viewer = viewer
        self.timeouts = timeouts
        self.session = session
    }

    func cancelInFlight() {
        inFlight?.cancel()
    }

    // MARK: loading

    func drives() async throws -> [String] {
        let response = try await perform(path: "/api/drives", timeout: timeouts.json)
        let rows = try JSONSerialization.jsonObject(with: response.data) as? [[String: Any]]
        return (rows ?? []).compactMap { $0["name"] as? String }
    }

    func authStatus() async throws -> ShareAuthStatus {
        let response = try await perform(path: "/api/auth/status", timeout: timeouts.json)
        let body = try JSONSerialization.jsonObject(with: response.data) as? [String: Any] ?? [:]
        return ShareAuthStatus(
            hasProtectedDrives: body["has_protected_drives"] as? Bool ?? false,
            unlockedGroups: body["unlocked_groups"] as? [String] ?? []
        )
    }

    func knowledgeAvailable(drive: String) async throws -> Bool {
        let response = try await perform(
            path: "/api/addons/status",
            query: [URLQueryItem(name: "drive", value: drive)],
            timeout: timeouts.json
        )
        let body = try JSONSerialization.jsonObject(with: response.data) as? [String: Any] ?? [:]
        let addons = body["addons"] as? [String: Any] ?? [:]
        return addons["knowledge"] != nil
    }

    func folders(drive: String, root: String) async throws -> [String] {
        let response = try await perform(
            path: "/api/drives/\(Self.encode(drive))/folder-tree",
            query: [URLQueryItem(name: "root", value: root)],
            timeout: timeouts.json
        )
        let rows = try JSONSerialization.jsonObject(with: response.data) as? [[String: Any]] ?? []
        return rows.compactMap { row in
            guard row["kind"] as? String == "folder" else { return nil }
            return row["path"] as? String
        }
    }

    // MARK: uploads

    func initUpload(
        drive: String,
        filename: String,
        fileSize: Int,
        folder: String,
        chunkSize: Int
    ) async throws -> ShareResponse {
        let body: [String: Any] = [
            "filename": filename,
            "file_size": fileSize,
            "folder_path": folder,
            "chunk_size": chunkSize,
            "inbox_source": "share",
        ]
        return try await perform(
            path: "/api/drives/\(Self.encode(drive))/upload/init",
            method: "POST",
            json: body,
            timeout: timeouts.json
        )
    }

    func chunk(drive: String, uploadID: String, index: Int, data: Data) async throws -> ShareResponse {
        let boundary = "Litloft-\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }
        field("chunk_index", String(index))
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"chunk\"; filename=\"chunk\"\r\n".utf8))
        body.append(Data("Content-Type: application/octet-stream\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return try await perform(
            path: "/api/drives/\(Self.encode(drive))/upload/\(uploadID)/chunk",
            method: "POST",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)",
            timeout: timeouts.chunk
        )
    }

    func complete(drive: String, uploadID: String) async throws -> ShareResponse {
        try await perform(
            path: "/api/drives/\(Self.encode(drive))/upload/\(uploadID)/complete",
            method: "POST",
            timeout: timeouts.complete
        )
    }

    func deleteUpload(drive: String, uploadID: String) async {
        _ = try? await perform(
            path: "/api/drives/\(Self.encode(drive))/upload/\(uploadID)",
            method: "DELETE",
            timeout: timeouts.json
        )
    }

    func byPath(drive: String, path: String) async throws -> Bool {
        let response = try await perform(
            path: "/api/drives/\(Self.encode(drive))/files/by-path",
            query: [URLQueryItem(name: "path", value: path)],
            timeout: timeouts.json
        )
        return response.status == 200
    }

    // MARK: creates

    func createFile(drive: String, path: String, content: String) async throws -> ShareResponse {
        let body: [String: Any] = [
            "path": path,
            "content": content,
            "conflict_mode": "rename",
            "arrival": ["source": "share", "i18n_key": "inbox.sourceShare"],
        ]
        return try await perform(
            path: "/api/drives/\(Self.encode(drive))/files",
            method: "POST",
            json: body,
            timeout: timeouts.create
        )
    }

    func createClip(drive: String, url: URL, subfolder: String?, title: String?) async throws -> ShareResponse {
        var body: [String: Any] = ["url": url.absoluteString]
        if let subfolder { body["subfolder"] = subfolder }
        if let title { body["title"] = title }
        return try await perform(
            path: "/api/addons/knowledge/clips",
            method: "POST",
            json: body,
            timeout: timeouts.create,
            extraHeaders: ["X-Lit-Drive": Self.encode(drive)]
        )
    }

    // MARK: one request

    private func perform(
        path: String,
        query: [URLQueryItem] = [],
        method: String = "GET",
        json: [String: Any]? = nil,
        body: Data? = nil,
        contentType: String? = nil,
        timeout: TimeInterval,
        extraHeaders: [String: String] = [:]
    ) async throws -> ShareResponse {
        guard var components = URLComponents(url: server, resolvingAgainstBaseURL: false) else {
            throw ShareAPIError.transport(.badURL)
        }
        components.percentEncodedPath = path
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else {
            throw ShareAPIError.transport(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let viewer {
            request.setValue(viewer, forHTTPHeaderField: "X-Lit-Viewer")
        }
        for (name, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: name)
        }
        if let json {
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        } else if let body {
            request.httpBody = body
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        let task = Task { try await session.data(for: request) }
        inFlight = task
        defer { inFlight = nil }

        do {
            let (data, response) = try await task.value
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if !(200...399).contains(status) {
                ShareLog.log(method: method, url: url, status: status, error: nil)
            }
            return ShareResponse(status: status, data: data)
        } catch let error as URLError {
            ShareLog.log(method: method, url: url, status: nil, error: error.code)
            throw ShareAPIError.transport(error.code)
        } catch is CancellationError {
            ShareLog.log(method: method, url: url, status: nil, error: .cancelled)
            throw ShareAPIError.transport(.cancelled)
        } catch {
            ShareLog.log(method: method, url: url, status: nil, error: .unknown)
            throw ShareAPIError.transport(.unknown)
        }
    }

    private static func encode(_ value: String) -> String {
        let unreserved = CharacterSet(
            charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
        )
        return value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }
}

/// The extension's log: what was asked and how it ended, never what was shared.
enum ShareLog {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "Litloft.Share",
        category: "share"
    )

    static func log(method: String, url: URL, status: Int?, error: URLError.Code?) {
        logger.error("\(entry(method: method, url: url, status: status, error: error), privacy: .public)")
    }

    static func entry(method: String, url: URL, status: Int?, error: URLError.Code?) -> String {
        let outcome = status.map(String.init) ?? error.map { String($0.rawValue) } ?? "-"
        return "\(method) \(pathTemplate(for: url)) \(outcome)"
    }

    /// The path with every drive, id, file name and query removed.
    static func pathTemplate(for url: URL) -> String {
        let path = url.path
        let patterns: [(String, String)] = [
            ("^/api/drives/[^/]+/upload/[^/]+/chunk$", "/api/drives/{drive}/upload/{id}/chunk"),
            ("^/api/drives/[^/]+/upload/[^/]+/complete$", "/api/drives/{drive}/upload/{id}/complete"),
            ("^/api/drives/[^/]+/upload/init$", "/api/drives/{drive}/upload/init"),
            ("^/api/drives/[^/]+/upload/[^/]+$", "/api/drives/{drive}/upload/{id}"),
            ("^/api/drives/[^/]+/files/by-path$", "/api/drives/{drive}/files/by-path"),
            ("^/api/drives/[^/]+/files$", "/api/drives/{drive}/files"),
            ("^/api/drives/[^/]+/folder-tree$", "/api/drives/{drive}/folder-tree"),
        ]
        for (pattern, template) in patterns where path.range(of: pattern, options: .regularExpression) != nil {
            return template
        }
        return path
    }
}

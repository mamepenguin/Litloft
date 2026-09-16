import Foundation

@MainActor
@Observable
final class ServerSettings {
    private static let key = "serverURL"

    private(set) var serverURL: URL?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Through the same gate as typed input: a value stored by an older
        // build, or edited by hand, is not trusted.
        if let stored = defaults.string(forKey: Self.key) {
            serverURL = ServerAddress.parse(stored)
        }
    }

    private let defaults: UserDefaults

    func use(_ url: URL) {
        serverURL = url
        defaults.set(url.absoluteString, forKey: Self.key)
    }

    func forget() {
        serverURL = nil
        defaults.removeObject(forKey: Self.key)
    }
}

enum ServerAddress {
    private static let maxPort = 65535

    /// Accepts what someone would actually type: `192.168.1.50:3000`,
    /// `http://litloft.local:3000`, with or without a trailing slash.
    static func parse(_ input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }

        if !text.contains("://") {
            text = "http://" + text
        }

        guard let components = URLComponents(string: text),
              let scheme = components.scheme,
              scheme == "http" || scheme == "https",
              let host = components.host,
              isValidHost(host)
        else { return nil }

        if let port = components.port, port < 1 || port > maxPort {
            return nil
        }

        var normalized = URLComponents()
        normalized.scheme = scheme
        normalized.host = host
        normalized.port = components.port
        return normalized.url
    }

    /// `URLComponents` tolerates characters no resolver will accept, so a
    /// typo reaches the network instead of the text field.
    private static func isValidHost(_ host: String) -> Bool {
        if host.hasPrefix("[") && host.hasSuffix("]") {
            return host.count > 2
        }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard !labels.isEmpty else { return false }
        return labels.allSatisfy(isValidLabel)
    }

    private static func isValidLabel(_ label: Substring) -> Bool {
        guard !label.isEmpty, label.count <= 63 else { return false }
        guard label.first != "-", label.last != "-" else { return false }
        return label.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
    }
}

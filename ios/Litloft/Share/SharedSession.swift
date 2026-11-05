import Foundation
import os
import Security

/// The App Group the app and its share extension both see.
enum AppGroup {
    /// The extension's bundle id ends in `.share`, so its own bundle id cannot
    /// name the group; the app's does.
    static var identifier: String {
        if let configured = configured("LITLOFTAppGroup") {
            return configured
        }
        return "group." + appBundleIdentifier
    }

    static var appBundleIdentifier: String {
        let id = Bundle.main.bundleIdentifier ?? "com.mamepenguin.Litloft"
        let suffix = ".share"
        return id.hasSuffix(suffix) ? String(id.dropLast(suffix.count)) : id
    }

    /// `AppIdentifierPrefix` + the group, expanded by the build settings into
    /// the target's Info.plist. A build without a team has no prefix, and a
    /// simulator accepts the bare group.
    static var keychainAccessGroup: String? {
        configured("LITLOFTKeychainGroup")
    }

    private static func configured(_ key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty,
              !value.contains("$(")
        else { return nil }
        return value
    }
}

/// What the app mirrors for the extension: which server, and the cookies the
/// web view holds for it.
struct SessionItem: Codable, Equatable, Sendable {
    var origin: String
    var accessToken: String?
    var viewer: String?

    enum CodingKeys: String, CodingKey {
        case origin
        case accessToken = "access_token"
        case viewer
    }

    /// `scheme://host[:port]`, the form a share extension can compare against
    /// the address it reads from the group.
    static func origin(of server: URL) -> String {
        guard let scheme = server.scheme?.lowercased(), let host = server.host() else { return "" }
        let literal = host.contains(":") && !host.hasPrefix("[") ? "[\(host)]" : host
        guard let port = server.port else { return "\(scheme)://\(literal)" }
        return "\(scheme)://\(literal):\(port)"
    }
}

/// The App Group's defaults and its keychain item, as the app and the share
/// extension both see them.
@MainActor
protocol SharedSession: AnyObject {
    var defaults: UserDefaults { get }
    func readItem() -> SessionItem?
    func writeItem(_ item: SessionItem) throws
    func deleteItem()
}

@MainActor
final class GroupSharedSession: SharedSession {
    let defaults: UserDefaults

    private let service = "litloft.share.session"
    private let accessGroup: String?
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "share-session")

    init(defaults: UserDefaults? = nil, accessGroup: String? = AppGroup.keychainAccessGroup) {
        self.defaults = defaults ?? UserDefaults(suiteName: AppGroup.identifier) ?? .standard
        self.accessGroup = accessGroup
    }

    private var baseQuery: [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    func readItem() -> SessionItem? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(SessionItem.self, from: data)
    }

    func writeItem(_ item: SessionItem) throws {
        let data = try JSONEncoder().encode(item)
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            // The previous item is left in place, so the extension can only
            // ever use a stale token, never an unset one.
            logger.error("share keychain write failed: \(status)")
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    func deleteItem() {
        let status = SecItemDelete(baseQuery as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            logger.error("share keychain delete failed: \(status)")
        }
    }
}

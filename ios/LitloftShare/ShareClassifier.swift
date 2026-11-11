import Foundation
import UniformTypeIdentifiers

#if !SHARE_EXTENSION
@testable import Litloft
#endif

/// The host hands these across queues and the extension only reads them.
extension NSExtensionItem: @retroactive @unchecked Sendable {}

/// What a share saves: one kind, with only the parts that kind keeps.
enum SharePayload: Equatable {
    case link(URL, title: String?)
    case files([NSItemProvider])
    case text(String)
    case nothing
}

/// The first role an attachment satisfies wins: a URL, then a file, then text.
enum ShareClassifier {
    private enum Role {
        case url(URL)
        case file(NSItemProvider)
        case text(String)
    }

    static func classify(_ items: [NSExtensionItem]) async -> SharePayload {
        var roles: [Role] = []
        for item in items {
            for provider in item.attachments ?? [] {
                if let role = await role(for: provider) {
                    roles.append(role)
                }
            }
        }

        let hasURL = roles.contains { if case .url = $0 { true } else { false } }
        let hasText = roles.contains { if case .text = $0 { true } else { false } }
        if !hasURL && !hasText {
            for item in items {
                if let content = item.attributedContentText?.string, !content.isEmpty {
                    roles.append(.text(content))
                }
            }
        }

        if let first = roles.first(where: { if case .url = $0 { true } else { false } }),
           case .url(let url) = first {
            return .link(url, title: title(of: items, roles: roles))
        }

        let files = roles.compactMap { role -> NSItemProvider? in
            if case .file(let provider) = role { return provider }
            return nil
        }
        if !files.isEmpty {
            return .files(files)
        }

        let texts = roles.compactMap { role -> String? in
            if case .text(let text) = role { return text }
            return nil
        }
        if !texts.isEmpty {
            return .text(texts.joined(separator: "\n\n"))
        }

        return .nothing
    }

    private static func role(for provider: NSItemProvider) async -> Role? {
        let types = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
        func conforms(to type: UTType) -> Bool {
            types.contains { $0.conforms(to: type) }
        }

        if conforms(to: .url) {
            if let url = await loadURL(provider),
               let scheme = url.scheme?.lowercased(),
               scheme == "http" || scheme == "https" {
                return .url(url)
            }
        }
        if conforms(to: .fileURL) || conforms(to: .image) || conforms(to: .movie) {
            return .file(provider)
        }
        if conforms(to: .data) && !conforms(to: .text) && !conforms(to: .url) {
            return .file(provider)
        }
        if conforms(to: .text), let text = await loadText(provider) {
            return .text(text)
        }
        return nil
    }

    private static func title(of items: [NSExtensionItem], roles: [Role]) -> String? {
        var candidates: [String] = []
        for item in items {
            if let title = item.attributedTitle?.string {
                candidates.append(title)
            }
            if let content = item.attributedContentText?.string {
                candidates.append(content)
            }
        }
        for role in roles {
            if case .text(let text) = role {
                candidates.append(text)
            }
        }
        for candidate in candidates {
            let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, !trimmed.contains("\n"), trimmed.count <= 200 {
                return trimmed
            }
        }
        return nil
    }

    private static func loadURL(_ provider: NSItemProvider) async -> URL? {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let item = await load(provider, UTType.url.identifier) {
            if let url = item as? URL { return url }
            if let url = item as? NSURL { return url as URL }
            if let data = item as? Data {
                var stale = false
                if let url = try? URL(
                    resolvingBookmarkData: data,
                    options: [],
                    relativeTo: nil,
                    bookmarkDataIsStale: &stale
                ) {
                    return url
                }
                if let url = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NSURL.self, from: data) {
                    return url as URL
                }

            }
        }
        // Some hosts hand a URL over as an object rather than an item.
        guard provider.canLoadObject(ofClass: NSURL.self) else { return nil }
        let box = await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: NSURL.self) { object, _ in
                continuation.resume(returning: ItemBox(object as? NSSecureCoding))
            }
        }
        return (box.value as? NSURL) as URL?
    }

    private static func loadText(_ provider: NSItemProvider) async -> String? {
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
           let item = await load(provider, UTType.plainText.identifier),
           let text = string(from: item) {
            return text
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier),
           let item = await load(provider, UTType.text.identifier),
           let text = string(from: item) {
            return text
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.rtf.identifier),
           let item = await load(provider, UTType.rtf.identifier),
           let data = item as? Data,
           let attributed = try? NSAttributedString(
               data: data,
               options: [.documentType: NSAttributedString.DocumentType.rtf],
               documentAttributes: nil
           ) {
            return attributed.string
        }
        return nil
    }

    /// The item provider's answer, as one value rather than a callback.
    private static func load(_ provider: NSItemProvider, _ type: String) async -> NSSecureCoding? {
        let box = await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                continuation.resume(returning: ItemBox(item))
            }
        }
        return box.value
    }

    private static func string(from item: NSSecureCoding) -> String? {        switch item {
        case let string as String:
            return string
        case let string as NSString:
            return string as String
        case let attributed as NSAttributedString:
            return attributed.string
        case let data as Data:
            return String(data: data, encoding: .utf8)
        default:
            return nil
        }
    }
}

/// `NSItemProvider` answers on its own queue; the box carries the answer
/// back across the continuation without making the value Sendable.
private final class ItemBox: @unchecked Sendable {
    let value: NSSecureCoding?

    init(_ value: NSSecureCoding?) {
        self.value = value
    }
}

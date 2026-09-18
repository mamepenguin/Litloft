import Foundation
import UIKit

/// Where an address the page asks for is taken.
enum LinkDestination: Equatable {
    /// Read in the shell's own web view.
    case shell
    /// Handed to the system: Safari, Mail, the phone.
    case system
    case nothing
}

enum ExternalLink {
    /// The shell shows the server it was pointed at and nothing else, so an
    /// address off that origin belongs to whichever app the system picks.
    static func destination(for url: URL?, server: URL, current: URL?) -> LinkDestination {
        guard let url, let scheme = url.scheme?.lowercased() else { return .nothing }
        guard !Self.inert.contains(scheme) else { return .nothing }
        guard MessageOrigin.isSameOrigin(url, as: server) else { return .system }

        if let current, page(of: url) == page(of: current) { return .nothing }
        return .shell
    }

    /// A link the page neutralised keeps its `target`, so a tap still asks for
    /// a window. Opening one would leave the app or reload the page.
    private static let inert: Set<String> = ["javascript", "data", "about"]

    private static func page(of url: URL) -> String {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.fragment = nil
        return components?.string ?? url.absoluteString
    }
}

@MainActor
protocol URLOpener: AnyObject {
    func open(_ url: URL)
}

@MainActor
final class SystemURLOpener: URLOpener {
    func open(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

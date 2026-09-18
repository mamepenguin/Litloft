import Foundation
import WebKit
import os

/// Reaches the `<video>` inside a YouTube embed, which the page cannot: the
/// frame is another origin. A script in a content world of the shell's own
/// announces each frame as it loads, and the shell keeps the embed frames so it
/// can later ask one's video to enter the system's fullscreen player.
///
/// The world's handler exists only in that world, so YouTube's own scripts
/// cannot post to it; a frame is judged by WebKit's account of it, never by
/// anything the script says.
@MainActor
final class EmbedFrames: NSObject, WKScriptMessageHandler {
    static let handlerName = "litloftEmbed"
    static let world = WKContentWorld.world(name: "litloft-embeds")

    /// Where embeds are served from. A test serves its own under a scheme it
    /// registers, since it cannot reach YouTube.
    struct Provider: Sendable {
        let scheme: String
        let hosts: Set<String>

        static let youtube = Provider(scheme: "https", hosts: ["www.youtube.com", "www.youtube-nocookie.com"])
    }

    private let provider: Provider
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "embeds")
    private weak var webView: WKWebView?
    private var frames: [String: WKFrameInfo] = [:]

    init(provider: Provider = .youtube) {
        self.provider = provider
    }

    func install(in configuration: WKWebViewConfiguration) {
        let controller = configuration.userContentController
        controller.add(self, contentWorld: Self.world, name: Self.handlerName)
        controller.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.\(Self.handlerName).postMessage(null);",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false,
            in: Self.world
        ))
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        let frame = message.frameInfo
        let origin = frame.securityOrigin
        guard let videoId = Self.videoId(
            isMainFrame: frame.isMainFrame,
            scheme: origin.protocol,
            host: origin.host,
            url: frame.request.url,
            provider: provider
        ) else { return }
        log.info("embed frame for \(videoId, privacy: .public)")
        frames[videoId] = frame
    }

    /// The video a frame embeds, or nil for any frame that is not an embed.
    /// Pure, so a test can hold it.
    nonisolated static func videoId(
        isMainFrame: Bool,
        scheme: String,
        host: String,
        url: URL?,
        provider: Provider = .youtube
    ) -> String? {
        guard !isMainFrame,
              scheme.lowercased() == provider.scheme,
              provider.hosts.contains(host.lowercased()),
              let url,
              url.scheme?.lowercased() == provider.scheme,
              let urlHost = url.host()?.lowercased(), provider.hosts.contains(urlHost)
        else { return nil }
        let parts = url.pathComponents
        guard parts.count == 3, parts[1] == "embed", isVideoId(parts[2]) else { return nil }
        return parts[2]
    }

    nonisolated static func isVideoId(_ value: String) -> Bool {
        value.count == 11 && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }

    /// A frame is recorded when it loads and may have moved on since, so the
    /// script checks where it is before it acts. A frame the page has since
    /// removed, or one whose video has no picture yet, does nothing.
    func enterFullscreen(videoId: String) {
        guard let webView, let frame = frames[videoId] else {
            log.info("no embed frame for \(videoId, privacy: .public)")
            return
        }
        webView.callAsyncJavaScript(
            Self.enterFullscreenScript,
            arguments: [
                "scheme": provider.scheme + ":",
                "hosts": Array(provider.hosts),
                "path": "/embed/" + videoId
            ],
            in: frame,
            in: Self.world
        ) { [log] result in
            switch result {
            case .success(let entered):
                log.info("fullscreen in the embed: \(String(describing: entered), privacy: .public)")
            case .failure(let error):
                log.error("fullscreen in the embed failed: \(error, privacy: .public)")
            }
        }
    }

    static let enterFullscreenScript = """
        if (location.protocol !== scheme || !hosts.includes(location.hostname) || location.pathname !== path) {
            return false;
        }
        const video = document.querySelector("video");
        if (!video || typeof video.webkitEnterFullscreen !== "function") return false;
        video.webkitEnterFullscreen();
        return true;
        """
}

import Foundation
import WebKit
import os

/// Carries messages between the web app and the shell. The web side reaches
/// it through `window.webkit.messageHandlers.litloft`; replies go back by
/// calling the `window.__litloft` receiver the web side installs.
@MainActor
final class ShellBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "litloft"
    /// Raised when a page needs something this shell did not have before. The
    /// page refuses a shell below the version it needs and plays the file
    /// itself. A shell ahead of the page keeps answering it, and says so when
    /// a command is one it cannot read.
    static let contractVersion = 3

    private let server: URL
    private weak var webView: WKWebView?
    let embeds: EmbedFrames

    /// Set by whatever owns the player; absent until then, so a command that
    /// arrives early is dropped rather than queued.
    var onMediaCommand: ((MediaCommand, String?) -> Void)?
    var onPageBackground: ((PageColor) -> Void)?

    init(server: URL, embeds: EmbedFrames = EmbedFrames()) {
        self.server = server
        self.embeds = embeds
    }
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "bridge")

    func install(in configuration: WKWebViewConfiguration) {
        configuration.userContentController.add(self, name: Self.handlerName)
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.__litloftShell = { version: \(Self.contractVersion) };",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        embeds.install(in: configuration)
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        embeds.attach(to: webView)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let action = Self.route(body: message.body, from: MessageOrigin(message), server: server) else {
            log.error("dropped an unroutable message")
            return
        }

        switch action {
        case .reply(let message):
            deliver(message)
        case .media(let command, let loadId):
            onMediaCommand?(command, loadId)
        case .pageBackground(let color):
            onPageBackground?(color)
        case .embedFullscreen(let videoId):
            embeds.enterFullscreen(videoId: videoId)
        case .unreadable(let loadId):
            log.error("a command about \(loadId, privacy: .public) was not readable")
            deliver(MediaState.unreadable(loadId: loadId))
        }
    }

    /// The whole acceptance decision: who may command the shell, what a command
    /// has to look like, and what it asks for. Pure, so a test can hold it.
    ///
    /// The handler is injected into every frame of every document the web view
    /// loads — WebKit offers no way to scope that — so the sender is checked
    /// here instead.
    nonisolated static func route(body: Any, from origin: MessageOrigin, server: URL) -> ShellAction? {
        guard origin.isTrusted(for: server),
              let body = body as? [String: Any],
              let type = body["type"] as? String
        else { return nil }

        if type == ShellMessageType.ping {
            guard let seq = body["seq"] as? Int else { return nil }
            return .reply(ShellMessage(type: ShellMessageType.pong, seq: seq))
        }
        if type == "page.background" {
            return (body["color"] as? String).flatMap(pageColor).map(ShellAction.pageBackground)
        }
        if type == "embed.fullscreen" {
            return (body["videoId"] as? String)
                .flatMap { EmbedFrames.isVideoId($0) ? ShellAction.embedFullscreen(videoId: $0) : nil }
        }
        return mediaAction(type, body, server: server)
    }

    /// A command about a file must name it; the player-wide settings do not.
    private nonisolated static func mediaAction(
        _ type: String,
        _ body: [String: Any],
        server: URL
    ) -> ShellAction? {
        if let setting = playerSetting(type, body) {
            return .media(setting, loadId: nil)
        }
        guard let loadId = nonEmpty(body["loadId"]) else { return nil }
        if type == "media.load" { return loadAction(body, loadId: loadId, server: server) }
        guard let command = fileCommand(type, body, server: server) else { return nil }
        return .media(command, loadId: loadId)
    }

    /// A file this shell refuses is silently not loaded; a file it cannot read
    /// is reported, because the page that sent it is built against another
    /// version of the contract and would otherwise wait for good.
    private nonisolated static func loadAction(
        _ body: [String: Any],
        loadId: String,
        server: URL
    ) -> ShellAction? {
        guard let source = source(body, server: server) else { return nil }
        guard let kind = (body["kind"] as? String).flatMap(MediaKind.init(rawValue:)) else {
            return .unreadable(loadId: loadId)
        }
        return .media(.load(source.with(kind)), loadId: loadId)
    }

    private nonisolated static func playerSetting(_ type: String, _ body: [String: Any]) -> MediaCommand? {
        switch type {
        case "media.setRate":
            (body["rate"] as? Double).flatMap { $0.isFinite && $0 > 0 ? .setRate($0) : nil }
        case "media.setVolume":
            (body["volume"] as? Double).flatMap { $0.isFinite ? .setVolume(min(max($0, 0), 1)) : nil }
        default:
            nil
        }
    }

    private nonisolated static func fileCommand(
        _ type: String,
        _ body: [String: Any],
        server: URL
    ) -> MediaCommand? {
        switch type {
        case "media.play":
            return .play
        case "media.pause":
            return .pause
        case "media.unload":
            return .unload
        case "media.surface":
            if body["geometry"] is NSNull { return .surface(nil) }
            return (body["geometry"] as? [String: Any]).flatMap(geometry).map(MediaCommand.surface)
        case "media.pip":
            return (body["active"] as? Bool).map { .pip(active: $0) }
        case "media.seek":
            guard let seekId = nonEmpty(body["seekId"]),
                  let time = body["time"] as? Double, time.isFinite
            else { return nil }
            return .seek(time: time, seekId: seekId)
        default:
            return nil
        }
    }

    private nonisolated static func number(_ value: Any?) -> Double? {
        // A JSON boolean arrives as an NSNumber too.
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        return double.isFinite ? double : nil
    }

    private nonisolated static func geometry(_ body: [String: Any]) -> SurfaceGeometry? {
        guard let left = number(body["x"]),
              let width = number(body["width"]), width > 0,
              let height = number(body["height"]), height > 0,
              let top = number(body["top"]),
              let anchorName = body["anchor"] as? String
        else { return nil }

        let anchor: SurfaceGeometry.Anchor
        switch anchorName {
        case "document":
            anchor = .document
        case "fixed":
            anchor = .fixed
        case "scroller":
            guard let box = body["scroller"] as? [String: Any],
                  let boxX = number(box["x"]), let boxY = number(box["y"]),
                  let boxWidth = number(box["width"]), let boxHeight = number(box["height"])
            else { return nil }
            anchor = .scroller(CGRect(x: boxX, y: boxY, width: boxWidth, height: boxHeight))
        default:
            return nil
        }

        let stick: SurfaceGeometry.Stick?
        switch (number(body["stickTop"]), number(body["stickLimit"])) {
        case let (top?, limit?):
            stick = SurfaceGeometry.Stick(top: top, limit: limit)
        case (nil, nil):
            guard body["stickTop"] == nil || body["stickTop"] is NSNull,
                  body["stickLimit"] == nil || body["stickLimit"] is NSNull
            else { return nil }
            stick = nil
        default:
            return nil
        }
        return SurfaceGeometry(left: left, width: width, height: height, anchor: anchor, top: top, stick: stick)
    }

    /// `#rgb` or `#rrggbb`, which is how the page's colour tokens are written.
    nonisolated static func pageColor(_ css: String) -> PageColor? {
        var hex = css.trimmingCharacters(in: .whitespaces)
        guard hex.hasPrefix("#") else { return nil }
        hex.removeFirst()
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        guard hex.count == 6, hex.allSatisfy(\.isHexDigit), let value = UInt32(hex, radix: 16) else { return nil }
        return PageColor(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    private nonisolated static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }

    /// The session's cookies go with whatever is loaded here, so both addresses
    /// must be the server's own. Artwork from anywhere else is dropped rather
    /// than refusing the file, since the file itself is fine.
    private nonisolated static func source(_ body: [String: Any], server: URL) -> MediaSource? {
        guard let raw = body["url"] as? String,
              let url = URL(string: raw),
              MessageOrigin.isSameOrigin(url, as: server),
              let title = body["title"] as? String
        else { return nil }

        let artwork = (body["artworkUrl"] as? String)
            .flatMap(URL.init(string:))
            .flatMap { MessageOrigin.isSameOrigin($0, as: server) ? $0 : nil }

        return MediaSource(
            url: url,
            title: title,
            artist: body["artist"] as? String,
            artworkURL: artwork
        )
    }

    func deliver(_ state: MediaState) {
        send(state, describedAs: "media.state")
    }

    private func deliver(_ message: ShellMessage) {
        send(message, describedAs: message.type)
    }

    private func send(_ payload: some Encodable, describedAs description: String) {
        guard let webView,
              let data = try? JSONEncoder().encode(payload),
              let json = String(data: data, encoding: .utf8)
        else { return }

        // The receiver is absent whenever nothing on the page is listening.
        webView.evaluateJavaScript("window.__litloft?.receive(\(json))") { [log] _, error in
            if let error {
                log.error("could not deliver \(description, privacy: .public): \(error, privacy: .public)")
            }
        }
    }
}

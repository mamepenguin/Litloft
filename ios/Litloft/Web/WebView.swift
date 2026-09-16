import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let model: WebViewModel

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()

        context.coordinator.bridge.install(in: configuration)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.attachBridge(to: webView)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true

        // Overscroll reveals this rather than a band in the wrong theme.
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.scrollView.alwaysBounceHorizontal = false

        context.coordinator.lastReloadToken = model.reloadToken
        context.coordinator.start(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastReloadToken != model.reloadToken else { return }
        context.coordinator.lastReloadToken = model.reloadToken
        webView.load(URLRequest(url: model.serverURL))
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: WebViewModel
        let bridge: ShellBridge
        var lastReloadToken = 0

        private(set) var player: MediaPlayer?

        /// When WebKit's content process dies, WebKit reloads the page itself
        /// unless this delegate handles it, and that reload stops the player.
        /// Off screen the audio is what the viewer is using, so the page waits
        /// until the app is back.
        var isActive: () -> Bool = { UIApplication.shared.applicationState == .active }
        private weak var webView: WKWebView?
        private var pageObservation: NSKeyValueObservation?
        private var lastPage: URL?
        private var pageToRestore: URL?
        private var activationObserver: NSObjectProtocol?

        init(model: WebViewModel) {
            self.model = model
            self.bridge = ShellBridge(server: model.serverURL)
        }

        isolated deinit {
            pageObservation?.invalidate()
            if let activationObserver {
                NotificationCenter.default.removeObserver(activationObserver)
            }
        }

        /// The bridge and the player hold each other's callbacks, so both
        /// sides are weak.
        func attachBridge(to webView: WKWebView) {
            bridge.attach(to: webView)

            let player = MediaPlayer(jar: webView.configuration.websiteDataStore.httpCookieStore)
            self.player = player

            bridge.onMediaCommand = { [weak player] command, loadId in
                player?.apply(command, loadId: loadId)
            }
            player.onState = { [weak bridge] state in
                bridge?.deliver(state)
            }
        }

        func start(_ webView: WKWebView) {
            watch(webView)
            webView.load(URLRequest(url: model.serverURL))
        }

        /// The address is read as it changes: the app moves between pages
        /// without loading them, and a dead page has no address left.
        func watch(_ webView: WKWebView) {
            self.webView = webView
            pageObservation = webView.observe(\.url, options: [.new]) { [weak self] _, change in
                guard let url = change.newValue ?? nil else { return }
                Task { @MainActor in self?.lastPage = url }
            }
            activationObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.restorePage() }
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            let page = lastPage ?? model.serverURL
            if isActive() {
                webView.load(URLRequest(url: page))
            } else {
                pageToRestore = page
            }
        }

        private func restorePage() {
            guard let page = pageToRestore else { return }
            pageToRestore = nil
            webView?.load(URLRequest(url: page))
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.markLoading()
            player?.stopForNavigation()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.markLoaded()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            model.markFailed(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.markFailed(error)
        }

        // Litloft draws its own context menus; the system callout would fight them.
        func webView(
            _ webView: WKWebView,
            contextMenuConfigurationFor elementInfo: WKContextMenuElementInfo
        ) async -> UIContextMenuConfiguration? {
            nil
        }
    }
}

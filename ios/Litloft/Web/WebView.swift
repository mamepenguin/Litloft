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

        init(model: WebViewModel) {
            self.model = model
            self.bridge = ShellBridge(server: model.serverURL)
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
            webView.load(URLRequest(url: model.serverURL))
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

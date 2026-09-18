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
        let opener: URLOpener
        let downloads = FileDownloads()
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

        init(model: WebViewModel, opener: URLOpener = SystemURLOpener()) {
            self.model = model
            self.bridge = ShellBridge(server: model.serverURL)
            self.opener = opener
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
            player.surface.attach(to: webView)
            bridge.onPageBackground = { [weak player] color in
                player?.surface.setPageColor(color)
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

        /// The app has no second window: an address of the server's own is read
        /// where the viewer is, and anything else is handed over.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            openInNewWindow(navigationAction.request, in: webView)
            return nil
        }

        /// Apart from the delegate because `WKNavigationAction` cannot be built
        /// outside WebKit, and a stand-in for it crashes as it is released.
        func openInNewWindow(_ request: URLRequest, in webView: WKWebView) {
            switch ExternalLink.destination(for: request.url, server: model.serverURL, current: webView.url) {
            case .shell: webView.load(request)
            case .system: request.url.map { opener.open($0) }
            case .nothing: break
            }
        }

        /// Only what the shell itself shows is judged here. A request for a new
        /// window is answered above, and a frame inside the page — an embed —
        /// navigates on its own.
        ///
        /// The page showing is not passed on, so a reload is a navigation to
        /// the server like any other.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            policy(for: navigationAction.request.url, inMainFrame: navigationAction.targetFrame?.isMainFrame == true)
        }

        func policy(for url: URL?, inMainFrame: Bool) -> WKNavigationActionPolicy {
            guard inMainFrame else { return .allow }

            switch ExternalLink.destination(for: url, server: model.serverURL, current: nil) {
            case .shell:
                return .allow
            case .system:
                url.map { opener.open($0) }
                return .cancel
            case .nothing:
                return .cancel
            }
        }

        /// A response the server marks as a file is taken as a download rather
        /// than drawn: the web view would replace the app's own screen with it.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse
        ) async -> WKNavigationResponsePolicy {
            policy(for: navigationResponse.response)
        }

        func policy(for response: URLResponse) -> WKNavigationResponsePolicy {
            FileDownloads.isAttachment(response) ? .download : .allow
        }

        func webView(
            _ webView: WKWebView,
            navigationResponse: WKNavigationResponse,
            didBecome download: WKDownload
        ) {
            downloads.take(download)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.markLoading()
        }

        /// The page on screen is what a stopped load costs, so the model is
        /// told whether there is one rather than asked to guess why it stopped.
        func loadFailed(_ error: Error, pageOnScreen: Bool) {
            model.markFailed(error, pageOnScreen: pageOnScreen)
        }

        /// The player stops when the page it belongs to is actually replaced.
        /// A navigation that becomes a download never commits, and the page —
        /// with whatever it is playing — stays.
        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
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
            loadFailed(error, pageOnScreen: webView.url != nil)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadFailed(error, pageOnScreen: webView.url != nil)
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

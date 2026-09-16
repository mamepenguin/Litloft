import SwiftUI
import WebKit

struct RootView: View {
    @State private var settings = ServerSettings()

    var body: some View {
        if let serverURL = settings.serverURL {
            WebShell(serverURL: serverURL) {
                Task {
                    await settings.leave(serverURL, jar: WKWebsiteDataStore.default().httpCookieStore)
                }
            }
            .id(serverURL)
        } else {
            ServerSetupView(initialText: settings.lastAddress) { url in
                settings.use(url)
            }
        }
    }
}

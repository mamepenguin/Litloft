import SwiftUI

struct RootView: View {
    @State private var settings = ServerSettings()

    var body: some View {
        if let serverURL = settings.serverURL {
            WebShell(serverURL: serverURL) {
                settings.forget()
            }
            .id(serverURL)
        } else {
            ServerSetupView { url in
                settings.use(url)
            }
        }
    }
}

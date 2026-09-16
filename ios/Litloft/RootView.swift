import SwiftUI

struct RootView: View {
    @State private var model = WebViewModel()

    var body: some View {
        ZStack {
            WebView(model: model)

            if case .failed(let message) = model.state {
                ConnectionErrorView(message: message) {
                    model.retry()
                }
            }
        }
    }
}

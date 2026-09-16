import SwiftUI

struct ServerSetupView: View {
    let initialText: String
    let onConnect: (URL) -> Void

    @State private var text: String
    @State private var showsInvalidAddress = false
    @FocusState private var addressFocused: Bool

    init(initialText: String = "", onConnect: @escaping (URL) -> Void) {
        self.initialText = initialText
        self.onConnect = onConnect
        _text = State(initialValue: initialText)
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 10) {
                Text("Connect to Litloft")
                    .font(.title2.weight(.semibold))
                Text("Enter the address of your Litloft server, including its port.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 8) {
                TextField("192.168.1.50:3000", text: $text)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($addressFocused)
                    .onSubmit(connect)
                    .onChange(of: text) { showsInvalidAddress = false }

                if showsInvalidAddress {
                    Text("That does not look like a server address.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            Button(action: connect) {
                Text("Connect")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)

            Spacer()
            Spacer()
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .onAppear { addressFocused = true }
    }

    private func connect() {
        guard let url = ServerAddress.parse(text) else {
            showsInvalidAddress = true
            return
        }
        onConnect(url)
    }
}

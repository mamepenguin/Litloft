import Foundation

@testable import Litloft

/// Real group-style defaults in a throwaway suite, and an in-memory keychain item.
@MainActor
final class FakeSharedSession: SharedSession {
    let defaults: UserDefaults
    private(set) var item: SessionItem?
    var failsWrites = false

    init(item: SessionItem? = nil) {
        defaults = UserDefaults(suiteName: "FakeSharedSession-\(UUID().uuidString)")!
        self.item = item
    }

    func readItem() -> SessionItem? {
        item
    }

    func writeItem(_ item: SessionItem) throws {
        if failsWrites { throw NSError(domain: NSOSStatusErrorDomain, code: -25_308) }
        self.item = item
    }

    func deleteItem() {
        item = nil
    }

    var shareKeys: [String] {
        defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("share.") }.sorted()
    }
}

@MainActor
func eventually(timeout: Duration = .seconds(3), _ condition: () -> Bool) async -> Bool {
    let deadline = ContinuousClock.now + timeout
    while !condition() {
        if ContinuousClock.now > deadline { return false }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return true
}

/// Lets queued async work run, for checks that something did not happen.
@MainActor
func settle() async {
    try? await Task.sleep(for: .milliseconds(300))
}

func localDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int, _ second: Int) -> Date {
    var components = DateComponents(
        year: year, month: month, day: day, hour: hour, minute: minute, second: second
    )
    components.timeZone = TimeZone.current
    return Calendar(identifier: .gregorian).date(from: components)!
}

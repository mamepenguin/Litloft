import Foundation
import Testing

@testable import Litloft

struct CookieVaultTests {
    @Test("only the session cookies are tracked")
    func trackedNames() {
        #expect(CookieVault.trackedNames.contains("access_token"))
        #expect(CookieVault.trackedNames.contains("lit_viewer"))
        #expect(CookieVault.trackedNames.count == 2)
    }
}

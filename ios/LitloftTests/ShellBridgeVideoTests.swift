import Foundation
import Testing

@testable import Litloft

private let server = URL(string: "http://litloft.local:3000")!
private let trusted = MessageOrigin(isMainFrame: true, scheme: "http", host: "litloft.local", port: 3000)

private func route(_ body: Any, from sender: MessageOrigin = trusted) -> ShellAction? {
    ShellBridge.route(body: body, from: sender, server: server)
}

private func surface(_ changes: [String: Any?]) -> [String: Any] {
    var geometry: [String: Any] = [
        "x": 0, "width": 402, "height": 226, "anchor": "document", "top": 104,
        "scroller": NSNull(), "stickTop": NSNull(), "stickLimit": NSNull()
    ]
    for (key, value) in changes {
        geometry[key] = value
    }
    return ["type": "media.surface", "loadId": "load-1", "geometry": geometry]
}

struct ShellBridgeVideoTests {
    @Test("a load says whether it is audio or video")
    func loadNeedsAKind() {
        let base: [String: Any] = [
            "type": "media.load", "loadId": "load-1",
            "url": "http://litloft.local:3000/api/files/abc/stream", "title": "t"
        ]
        #expect(route(base) == nil)

        var unknown = base
        unknown["kind"] = "image"
        #expect(route(unknown) == nil)

        var video = base
        video["kind"] = "video"
        guard case .media(.load(let source), "load-1")? = route(video) else {
            Issue.record("a video load should be accepted")
            return
        }
        #expect(source.kind == .video)
    }

    @Test("a frame the shell cannot place does nothing")
    func unplaceableSurfaceIsRejected() {
        let rejected: [[String: Any?]] = [
            ["width": 0], ["height": -1], ["x": Double.nan], ["top": Double.infinity],
            ["anchor": "floating"], ["anchor": NSNull()], ["width": "402"], ["width": true],
            ["anchor": "scroller"],
            ["anchor": "scroller", "scroller": ["x": 0, "y": 0, "width": 10]],
            ["stickTop": 10], ["stickLimit": 10], ["stickTop": 10, "stickLimit": "x"]
        ]
        for changes in rejected {
            #expect(route(surface(changes)) == nil, "accepted \(changes)")
        }
    }

    @Test("a frame without a geometry field does nothing, and null means no frame")
    func missingGeometryIsNotNull() {
        #expect(route(["type": "media.surface", "loadId": "load-1"]) == nil)
        #expect(route(["type": "media.surface", "loadId": "load-1", "geometry": NSNull()])
            == .media(.surface(nil), loadId: "load-1"))
    }

    @Test("a scroller frame carries the scroller's box, and a sticky frame its bounds")
    func scrollerAndStickAreRead() {
        let body = surface([
            "anchor": "scroller",
            "scroller": ["x": 1, "y": 2, "width": 3, "height": 4],
            "stickTop": 56, "stickLimit": 900
        ])
        #expect(route(body) == .media(.surface(SurfaceGeometry(
            left: 0, width: 402, height: 226,
            anchor: .scroller(CGRect(x: 1, y: 2, width: 3, height: 4)), top: 104,
            stick: SurfaceGeometry.Stick(top: 56, limit: 900)
        )), loadId: "load-1"))
    }

    @Test("picture in picture is asked for with a yes or a no")
    func pipNeedsABoolean() {
        #expect(route(["type": "media.pip", "loadId": "load-1", "active": false])
            == .media(.pip(active: false), loadId: "load-1"))
        #expect(route(["type": "media.pip", "loadId": "load-1"]) == nil)
        #expect(route(["type": "media.pip", "loadId": "load-1", "active": "yes"]) == nil)
    }

    @Test("the page colour is read from its hex spelling", arguments: [
        ("#fff", PageColor(red: 1, green: 1, blue: 1)),
        ("#1a0e10", PageColor(red: 0x1A / 255, green: 0x0E / 255, blue: 0x10 / 255)),
        (" #000000 ", PageColor(red: 0, green: 0, blue: 0))
    ])
    func pageColourIsRead(css: String, expected: PageColor) {
        #expect(route(["type": "page.background", "color": css]) == .pageBackground(expected))
    }

    @Test("a page colour the shell cannot read does nothing", arguments: [
        "", "fff", "#ffff", "#gggggg", "rgb(0, 0, 0)", "#+12345", "#12 345"
    ])
    func unreadablePageColourIsRejected(css: String) {
        #expect(route(["type": "page.background", "color": css]) == nil)
    }

    @Test("a page colour from anyone but the server does nothing")
    func pageColourNeedsTheServer() {
        let stranger = MessageOrigin(isMainFrame: false, scheme: "http", host: "litloft.local", port: 3000)
        #expect(route(["type": "page.background", "color": "#fff"], from: stranger) == nil)
    }
}

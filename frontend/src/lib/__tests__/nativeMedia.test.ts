import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MediaState } from "../nativeBridge";

type Media = typeof import("../nativeMedia");
type Channel = InstanceType<Media["MediaChannel"]>;

/** The same samples the Swift tests read, so both sides agree on one wire. */
const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "shell-contract.json"), "utf-8"),
) as { commands: Record<string, Record<string, unknown>>; states: Record<string, MediaState> };

interface StubbedWindow extends Window {
  webkit?: unknown;
  __litloft?: { receive(payload: unknown): void };
}

const win = () => window as StubbedWindow;
let posted: Record<string, unknown>[] = [];

function installShell(): void {
  posted = [];
  win().webkit = {
    messageHandlers: {
      litloft: { postMessage: (body: unknown) => posted.push(body as Record<string, unknown>) },
    },
  };
}

function deliver(state: MediaState): void {
  win().__litloft?.receive(state);
}

async function load(): Promise<Media> {
  vi.resetModules();
  return import("../nativeMedia");
}

/** Ids handed out in order, so a test can name them. */
function scriptIds(...ids: string[]) {
  const queue = [...ids];
  return () => queue.shift() ?? "unexpected-id";
}

afterEach(() => {
  vi.restoreAllMocks();
  delete win().webkit;
  delete win().__litloft;
});

describe("outside the shell", () => {
  it("has no channel to create", async () => {
    const media = await load();
    expect(media.createMediaChannel()).toBeNull();
  });
});

describe("the wire", () => {
  let channel: Channel;

  beforeEach(async () => {
    installShell();
    const media = await load();
    channel = new media.MediaChannel(scriptIds("load-1", "seek-1"));
  });

  afterEach(() => channel.dispose());

  it("sends each command exactly as the shared sample spells it", () => {
    const { commands } = contract;
    channel.load({
      url: commands.load.url as string,
      title: commands.load.title as string,
      artist: commands.load.artist as string,
      artworkUrl: commands.load.artworkUrl as string,
    });
    channel.play();
    channel.pause();
    channel.seek(42.5);
    channel.setRate(1.5);
    channel.setVolume(0.25);
    channel.unload();

    expect(posted).toEqual([
      commands.load,
      commands.play,
      commands.pause,
      commands.seek,
      commands.setRate,
      commands.setVolume,
      commands.unload,
    ]);
  });

  it("reads each report the shared sample spells", () => {
    channel.load({ url: "http://litloft.local:3000/api/files/abc/stream", title: "A" });

    deliver(contract.states.readyWhilePaused);
    expect(channel.read()).toEqual({
      time: 0,
      duration: 180,
      paused: true,
      rate: 1,
      volume: 1,
      buffered: 12,
      ended: false,
      status: "ready",
    });

    deliver(contract.states.failed);
    expect(channel.read().status).toBe("failed");
  });
});

describe("the media channel", () => {
  let media: Media;
  let channel: Channel;
  let loadId: string;

  /** A report about this channel's own file. */
  const report = (overrides: Partial<MediaState> = {}) =>
    deliver({ ...contract.states.readyWhilePaused, loadId, ...overrides });

  beforeEach(async () => {
    installShell();
    media = await load();
    channel = new media.MediaChannel();
    channel.load({ url: "http://litloft.local:3000/api/files/a/stream", title: "A" });
    loadId = posted[0].loadId as string;
  });

  afterEach(() => channel.dispose());

  it("makes its ids without randomUUID, which a plain-HTTP page does not have", () => {
    const fresh = new media.MediaChannel();
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("crypto.randomUUID is not a function");
    });
    const before = posted.length;

    fresh.load({ url: "http://litloft.local:3000/api/files/c/stream", title: "C" });
    fresh.seek(3);

    const sent = posted.slice(before);
    expect(sent.map((m) => m.type)).toEqual(["media.load", "media.seek"]);
    expect(sent[0].loadId).toMatch(/^[0-9a-f]{32}$/);
    expect(sent[1].seekId).toMatch(/^[0-9a-f]{32}$/);
    expect(sent[1].seekId).not.toBe(sent[0].loadId);
    fresh.dispose();
  });

  it("gives every file and every seek an id of its own", () => {
    channel.seek(10);
    channel.seek(20);
    channel.load({ url: "http://litloft.local:3000/api/files/b/stream", title: "B" });

    const ids = posted.flatMap((m) => [m.loadId, m.seekId]).filter(Boolean);
    const seekIds = posted.filter((m) => m.type === "media.seek").map((m) => m.seekId);
    const loadIds = posted.filter((m) => m.type === "media.load").map((m) => m.loadId);
    expect(new Set(seekIds).size).toBe(2);
    expect(new Set(loadIds).size).toBe(2);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("says nothing about a file before one is loaded", async () => {
    const fresh = new media.MediaChannel();
    const before = posted.length;

    fresh.play();
    fresh.pause();
    fresh.seek(5);
    fresh.unload();

    expect(posted.length).toBe(before);
    fresh.dispose();
  });

  it("reads back what the shell reports", () => {
    report({ time: 42, duration: 100, paused: false, rate: 1.5, volume: 0.3, buffered: 60 });

    expect(channel.read()).toEqual({
      time: 42,
      duration: 100,
      paused: false,
      rate: 1.5,
      volume: 0.3,
      buffered: 60,
      ended: false,
      status: "ready",
    });
  });

  it("does not assume a rate the shell may refuse", () => {
    channel.setRate(2);
    expect(channel.read().rate).toBe(1);

    report({ rate: 1.5 });
    expect(channel.read().rate).toBe(1.5);
  });

  describe("a report about another file", () => {
    it("is not applied", () => {
      report({ time: 5, duration: 100 });

      deliver({ ...contract.states.seekLanded, loadId: "someone-else", time: 180, ended: true });

      expect(channel.read()).toMatchObject({ time: 5, duration: 100, ended: false });
    });

    /** The shell outlives the page, so a report can come from before this page existed. */
    it("is not applied because its file is now loading", () => {
      const ended = vi.fn();
      const ready = vi.fn();
      channel.onEnded = ended;
      channel.onReady = ready;

      deliver({ ...contract.states.readyWhilePaused, loadId: "the-previous-page", ended: true });

      expect(ended).not.toHaveBeenCalled();
      expect(ready).not.toHaveBeenCalled();
      expect(channel.read().status).toBe("loading");
    });

    it("is not applied with nothing loaded", () => {
      deliver(contract.states.nothingLoaded);
      expect(channel.read().status).toBe("loading");

      const fresh = new media.MediaChannel();
      deliver({ ...contract.states.readyWhilePaused, loadId });
      expect(fresh.read().duration).toBe(0);
      fresh.dispose();
    });
  });

  describe("a seek", () => {
    const seekId = () => posted.filter((m) => m.type === "media.seek").at(-1)?.seekId as string;

    it("holds its position until the shell reports that seek reached", () => {
      report({ time: 10, paused: false });
      channel.seek(90);
      expect(channel.read().time).toBe(90);

      report({ time: 11, paused: false });
      expect(channel.read().time).toBe(90);

      report({ time: 90.5, paused: false, seekId: seekId() });
      expect(channel.read().time).toBe(90.5);
    });

    it("lets every other field update while it is outstanding", () => {
      channel.seek(90);
      report({ time: 11, duration: 250, paused: false, volume: 0.2 });

      expect(channel.read()).toMatchObject({ time: 90, duration: 250, paused: false, volume: 0.2 });
    });

    it("keeps holding for the newer of two, even once the older is reported", () => {
      channel.seek(30);
      const first = seekId();
      channel.seek(60);

      report({ time: 30, seekId: first });
      expect(channel.read().time).toBe(60);

      report({ time: 60, seekId: seekId() });
      expect(channel.read().time).toBe(60);
    });

    it("stops holding once reached", () => {
      channel.seek(90);
      const id = seekId();
      report({ time: 90, seekId: id });
      report({ time: 91, seekId: id });

      expect(channel.read().time).toBe(91);
    });

    /** A seek on a file that failed is never reported as reached. */
    it("lets go when the file fails", () => {
      channel.seek(90);
      report({ ...contract.states.failed, loadId, time: 0 });

      expect(channel.read().time).toBe(0);
    });
  });

  describe("readiness", () => {
    it("is announced when the shell says the file can be played, even while paused", () => {
      const ready = vi.fn();
      channel.onReady = ready;

      report({ status: "loading", duration: 0 });
      expect(ready).not.toHaveBeenCalled();

      report({ status: "ready", paused: true });
      report({ status: "ready", paused: true, time: 1 });
      expect(ready).toHaveBeenCalledOnce();
    });

    /** A live stream has no length and can still be played. */
    it("does not wait for a length", () => {
      const ready = vi.fn();
      channel.onReady = ready;

      report({ status: "ready", duration: 0 });

      expect(ready).toHaveBeenCalledOnce();
    });

    it("is not announced for a file that failed", () => {
      const ready = vi.fn();
      channel.onReady = ready;

      report({ ...contract.states.failed, loadId });

      expect(ready).not.toHaveBeenCalled();
    });

    it("is announced again for the next file", () => {
      const ready = vi.fn();
      channel.onReady = ready;

      report({ status: "ready" });
      channel.load({ url: "http://litloft.local:3000/api/files/b/stream", title: "B" });
      const next = posted.at(-1)?.loadId as string;
      deliver({ ...contract.states.readyWhilePaused, loadId: next });

      expect(ready).toHaveBeenCalledTimes(2);
    });
  });

  describe("failure", () => {
    it("is announced once when the shell says the file cannot be played", () => {
      const failed = vi.fn();
      channel.onFailed = failed;

      report({ status: "loading", duration: 0 });
      expect(failed).not.toHaveBeenCalled();

      report({ ...contract.states.failed, loadId });
      report({ ...contract.states.failed, loadId });
      expect(failed).toHaveBeenCalledOnce();
      expect(channel.read().status).toBe("failed");
    });

    it("is not announced for a file that plays", () => {
      const failed = vi.fn();
      channel.onFailed = failed;

      report({ status: "ready" });

      expect(failed).not.toHaveBeenCalled();
    });

    it("is not taken from another file's report", () => {
      const failed = vi.fn();
      channel.onFailed = failed;

      deliver({ ...contract.states.failed, loadId: "someone-else" });

      expect(failed).not.toHaveBeenCalled();
    });

    it("is announced again for the next file", () => {
      const failed = vi.fn();
      channel.onFailed = failed;

      report({ ...contract.states.failed, loadId });
      channel.load({ url: "http://litloft.local:3000/api/files/b/stream", title: "B" });
      const next = posted.at(-1)?.loadId as string;
      deliver({ ...contract.states.failed, loadId: next });

      expect(failed).toHaveBeenCalledTimes(2);
    });
  });

  describe("the end of a file", () => {
    it("is said once, however many times the shell repeats it", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      report({ time: 180, ended: true });
      report({ time: 180, ended: true });

      expect(ended).toHaveBeenCalledOnce();
    });

    it("is said again for the next file that runs out", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      report({ ended: true });
      channel.load({ url: "http://litloft.local:3000/api/files/b/stream", title: "B" });
      deliver({ ...contract.states.readyWhilePaused, loadId: posted.at(-1)?.loadId as string, ended: true });

      expect(ended).toHaveBeenCalledTimes(2);
    });

    it("is not said while the file is still playing", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      report({ time: 50, paused: false });

      expect(ended).not.toHaveBeenCalled();
    });
  });

  describe("unloading", () => {
    /** Whatever tears down next reads the position to save it. */
    it("keeps the last reading", () => {
      report({ time: 42, duration: 180, paused: false });

      channel.unload();

      expect(channel.read()).toMatchObject({ time: 42, duration: 180 });
    });

    it("is not undone by the shell's own answer to it", () => {
      report({ time: 42, duration: 180 });
      channel.unload();

      deliver({ ...contract.states.nothingLoaded });
      report({ time: 0, duration: 0 });

      expect(channel.read()).toMatchObject({ time: 42, duration: 180 });
    });

    it("names the file it gives back", () => {
      channel.unload();

      expect(posted.at(-1)).toEqual({ type: "media.unload", loadId });
    });
  });

  it("ignores a payload that is not a report", () => {
    report({ time: 5 });
    win().__litloft?.receive({ type: "pong", seq: 1 });

    expect(channel.read().time).toBe(5);
  });

  it("stops listening once disposed", () => {
    channel.dispose();
    report({ time: 99 });

    expect(channel.read().time).toBe(0);
  });
});

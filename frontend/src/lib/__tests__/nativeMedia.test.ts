import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Media = typeof import("../nativeMedia");
type Channel = InstanceType<Media["MediaChannel"]>;
type Tick = import("../nativeBridge").MediaTick;

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

function deliver(tick: Tick): void {
  win().__litloft?.receive(tick);
}

const seqOf = (type: string) => posted.filter((m) => m.type === type).at(-1)?.seq as number;

async function load(): Promise<Media> {
  vi.resetModules();
  return import("../nativeMedia");
}

const SOURCE = { url: "http://litloft.local:3000/api/files/a/stream", title: "A" };

afterEach(() => {
  delete win().webkit;
  delete win().__litloft;
});

describe("outside the shell", () => {
  it("has no channel to create", async () => {
    const media = await load();
    expect(media.createMediaChannel()).toBeNull();
  });
});

describe("the media channel", () => {
  let media: Media;
  let channel: Channel;

  /** A reading of this channel's own file, taken at `appliedSeq`. */
  const tick = (overrides: Partial<Tick> = {}) =>
    deliver({
      type: "media.tick",
      appliedSeq: seqOf("media.load"),
      time: 0,
      duration: 0,
      paused: true,
      rate: 1,
      volume: 1,
      buffered: 0,
      ended: false,
      ...overrides,
    });

  beforeEach(async () => {
    installShell();
    media = await load();
    channel = new media.MediaChannel();
    channel.load(SOURCE);
  });

  afterEach(() => channel.dispose());

  it("stamps every command with a rising sequence", () => {
    channel.play();
    channel.pause();
    channel.seek(30);

    const seqs = posted.map((m) => m.seq as number);
    expect(seqs).toHaveLength(4);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(4);
  });

  it("sends what the shell needs to play and label a file", () => {
    expect(posted[0]).toMatchObject({ type: "media.load", ...SOURCE });
    expect(channel.read().time).toBe(0);
  });

  it("reads back what the shell reports", () => {
    tick({ time: 42, duration: 100, paused: false, rate: 1.5, volume: 0.3, buffered: 60 });

    expect(channel.read()).toEqual({
      time: 42,
      duration: 100,
      paused: false,
      rate: 1.5,
      volume: 0.3,
      buffered: 60,
      ended: false,
    });
  });

  it("does not assume a rate the shell may refuse", () => {
    channel.setRate(2);
    expect(channel.read().rate).toBe(1);

    tick({ rate: 1.5, appliedSeq: seqOf("media.setRate") });
    expect(channel.read().rate).toBe(1.5);
  });

  describe("a seek", () => {
    it("holds its position until a reading taken after it arrives", () => {
      tick({ time: 10, duration: 100, paused: false });
      channel.seek(90);
      expect(channel.read().time).toBe(90);

      // This file's, but from before the seek landed.
      tick({ time: 11, duration: 100, paused: false });
      expect(channel.read().time).toBe(90);

      tick({ time: 90.5, duration: 100, paused: false, appliedSeq: seqOf("media.seek") });
      expect(channel.read().time).toBe(90.5);
    });

    it("lets every other field update while it is outstanding", () => {
      channel.seek(90);
      tick({ time: 11, duration: 250, paused: false, volume: 0.2 });

      const shadow = channel.read();
      expect(shadow.time).toBe(90);
      expect(shadow.duration).toBe(250);
      expect(shadow.paused).toBe(false);
      expect(shadow.volume).toBe(0.2);
    });

    it("takes the newer of two, whichever order the readings arrive in", () => {
      channel.seek(30);
      channel.seek(60);
      const second = seqOf("media.seek");

      tick({ time: 30, appliedSeq: second - 1 });
      expect(channel.read().time).toBe(60);

      tick({ time: 60, appliedSeq: second });
      expect(channel.read().time).toBe(60);
    });

    it("stops holding once it is acknowledged", () => {
      channel.seek(90);
      tick({ time: 90, appliedSeq: seqOf("media.seek") });
      tick({ time: 91, appliedSeq: seqOf("media.seek") });

      expect(channel.read().time).toBe(91);
    });
  });

  describe("a reading about another file", () => {
    it("is not applied to this one", () => {
      tick({ time: 5, duration: 100 });

      deliver({
        type: "media.tick",
        appliedSeq: seqOf("media.load") - 1,
        time: 180,
        duration: 180,
        paused: false,
        rate: 1,
        volume: 1,
        buffered: 180,
        ended: true,
      });

      expect(channel.read()).toMatchObject({ time: 5, duration: 100, ended: false });
    });

    /** The previous file's end, still in flight when the next one loaded. */
    it("does not say this file ran out", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      deliver({
        type: "media.tick",
        appliedSeq: seqOf("media.load") - 1,
        time: 180,
        duration: 180,
        paused: true,
        rate: 1,
        volume: 1,
        buffered: 180,
        ended: true,
      });

      expect(ended).not.toHaveBeenCalled();
    });

    it("is not accepted before a file is loaded", async () => {
      const fresh = new media.MediaChannel();
      deliver({
        type: "media.tick",
        appliedSeq: 9_999,
        time: 42,
        duration: 100,
        paused: false,
        rate: 1,
        volume: 1,
        buffered: 0,
        ended: false,
      });

      expect(fresh.read().time).toBe(0);
      fresh.dispose();
    });
  });

  describe("the end of a file", () => {
    it("is said once", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      tick({ time: 100, duration: 100, ended: true });
      // The shell says it again when the app comes back on screen.
      tick({ time: 100, duration: 100, ended: true });

      expect(ended).toHaveBeenCalledOnce();
    });

    it("is said again for the next file that runs out", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      tick({ ended: true });
      channel.load({ url: "http://litloft.local:3000/api/files/b/stream", title: "B" });
      tick({ ended: true });

      expect(ended).toHaveBeenCalledTimes(2);
    });

    it("is not said while the file is still playing", () => {
      const ended = vi.fn();
      channel.onEnded = ended;

      tick({ time: 50, duration: 100 });

      expect(ended).not.toHaveBeenCalled();
    });
  });

  describe("unloading", () => {
    /** Whatever tears down next reads the position to save it. */
    it("keeps the last reading", () => {
      tick({ time: 42, duration: 180, paused: false });

      channel.unload();

      expect(channel.read()).toMatchObject({ time: 42, duration: 180 });
    });

    it("is not undone by the shell's own answer to it", () => {
      tick({ time: 42, duration: 180 });
      channel.unload();

      tick({ time: 0, duration: 0, appliedSeq: seqOf("media.unload") });

      expect(channel.read()).toMatchObject({ time: 42, duration: 180 });
    });
  });

  it("ignores a payload that is not a tick", () => {
    tick({ time: 5 });
    win().__litloft?.receive({ type: "pong", seq: 1 });

    expect(channel.read().time).toBe(5);
  });

  it("stops listening once disposed", () => {
    channel.dispose();
    tick({ time: 99 });

    expect(channel.read().time).toBe(0);
  });
});

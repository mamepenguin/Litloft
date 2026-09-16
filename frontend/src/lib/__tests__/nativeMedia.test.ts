import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Media = typeof import("../nativeMedia");
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

function tick(overrides: Partial<Tick> = {}): void {
  win().__litloft?.receive({
    type: "media.tick",
    appliedSeq: 0,
    time: 0,
    duration: 0,
    paused: true,
    rate: 1,
    volume: 1,
    ended: false,
    ...overrides,
  });
}

const seqOf = (type: string) => posted.find((m) => m.type === type)?.seq as number;

async function load(): Promise<Media> {
  vi.resetModules();
  return import("../nativeMedia");
}

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
  let channel: InstanceType<Media["MediaChannel"]>;

  beforeEach(async () => {
    installShell();
    media = await load();
    channel = new media.MediaChannel();
  });

  afterEach(() => channel.dispose());

  it("stamps every command with a rising sequence", () => {
    channel.play();
    channel.pause();
    channel.seek(30);

    const seqs = posted.map((m) => m.seq as number);
    expect(seqs).toHaveLength(3);
    expect(seqs[1]).toBeGreaterThan(seqs[0]);
    expect(seqs[2]).toBeGreaterThan(seqs[1]);
  });

  it("sends what the shell needs to play and label a file", () => {
    channel.load({ url: "http://litloft.local:3000/api/files/abc/stream", title: "A note", startAt: 12 });

    expect(posted[0]).toMatchObject({
      type: "media.load",
      url: "http://litloft.local:3000/api/files/abc/stream",
      title: "A note",
      startAt: 12,
    });
    expect(channel.read().time).toBe(12);
  });

  it("reads back what the shell reports", () => {
    tick({ time: 42, duration: 100, paused: false, rate: 1.5, volume: 0.3, ended: false });

    expect(channel.read()).toEqual({
      time: 42,
      duration: 100,
      paused: false,
      rate: 1.5,
      volume: 0.3,
      ended: false,
    });
  });

  it("does not assume a rate the shell may refuse", () => {
    channel.setRate(2);
    expect(channel.read().rate).toBe(1);

    tick({ rate: 1.5, appliedSeq: seqOf("media.setRate") });
    expect(channel.read().rate).toBe(1.5);
  });

  it("holds a seek until a reading taken after it arrives", () => {
    tick({ time: 10, duration: 100, paused: false, appliedSeq: 0 });
    channel.seek(90);
    expect(channel.read().time).toBe(90);

    // In flight when the seek went out: its position is from before.
    tick({ time: 11, duration: 100, paused: false, appliedSeq: 0 });
    expect(channel.read().time).toBe(90);

    tick({ time: 90.5, duration: 100, paused: false, appliedSeq: seqOf("media.seek") });
    expect(channel.read().time).toBe(90.5);
  });

  it("keeps reporting everything else while a seek is outstanding", () => {
    channel.seek(90);
    tick({ time: 11, duration: 250, paused: false, volume: 0.2, appliedSeq: 0 });

    const shadow = channel.read();
    expect(shadow.time).toBe(90);
    expect(shadow.duration).toBe(250);
    expect(shadow.paused).toBe(false);
    expect(shadow.volume).toBe(0.2);
  });

  it("takes the newer of two seeks, whichever order the ticks arrive in", () => {
    channel.seek(30);
    channel.seek(60);
    const second = posted.filter((m) => m.type === "media.seek").at(-1)!.seq as number;

    tick({ time: 30, appliedSeq: second - 1 });
    expect(channel.read().time).toBe(60);

    tick({ time: 60, appliedSeq: second });
    expect(channel.read().time).toBe(60);
  });

  it("stops holding a position once the seek is acknowledged", () => {
    channel.seek(90);
    tick({ time: 90, appliedSeq: seqOf("media.seek") });
    tick({ time: 91, appliedSeq: seqOf("media.seek") });

    expect(channel.read().time).toBe(91);
  });

  it("ignores a payload that is not a tick", () => {
    tick({ time: 5, appliedSeq: 0 });
    win().__litloft?.receive({ type: "pong", seq: 1 });

    expect(channel.read().time).toBe(5);
  });

  it("forgets everything on unload", () => {
    tick({ time: 42, duration: 100, paused: false, ended: true });
    channel.unload();

    expect(channel.read()).toEqual({
      time: 0,
      duration: 0,
      paused: true,
      rate: 1,
      volume: 1,
      ended: false,
    });
  });

  it("stops listening once disposed", () => {
    channel.dispose();
    tick({ time: 99 });

    expect(channel.read().time).toBe(0);
  });
});

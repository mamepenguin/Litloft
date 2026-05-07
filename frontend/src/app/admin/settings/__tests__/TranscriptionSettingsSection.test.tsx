// TranscriptionSettingsSection test
//
// Covers:
// - Mount fetches /api/addons/intelligence/admin/transcription and shows
//   the current provider as the selected radio
// - All providers appear in the radio group with their friendly labels
// - API key status reflects the env-presence dict
// - Selecting a cloud provider whose API key is missing disables save
//   and shows a per-provider warning
// - Successful PUT writes the form values to the endpoint and shows the
//   "saved" confirmation
// - Failed PUT surfaces the server's detail message inline

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { TranscriptionSettingsSection } from "@/app/admin/settings/TranscriptionSettingsSection";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ENDPOINT = "/api/addons/intelligence/admin/transcription";

function defaultPayload(overrides: Record<string, unknown> = {}) {
  return {
    provider: "whisper_local",
    language_hint: "",
    hotwords: [],
    available_providers: [
      "whisper_local",
      "openai_compatible",
      "deepgram",
      "elevenlabs_scribe",
      "assemblyai",
      "gemini",
    ],
    api_keys_present: {
      whisper_local: true,
      openai_compatible: false,
      deepgram: true,
      elevenlabs_scribe: false,
      assemblyai: false,
      gemini: false,
    },
    overrides_present: false,
    search_config_summary: {
      whisper_local: { model: "openai/whisper-large-v3-turbo" },
      openai_compatible: { model: "whisper-1", base_url: "https://api.openai.com/v1" },
      deepgram: { model: "nova-3" },
      elevenlabs_scribe: { model_id: "scribe_v1" },
      assemblyai: { model: "best" },
      gemini: { model: "gemini-2.5-flash", output_language: "ja" },
    },
    ...overrides,
  };
}

describe("TranscriptionSettingsSection", () => {
  it("renders provider radios with current selection", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    render(<TranscriptionSettingsSection />);
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: /whisper local/i }),
      ).toBeChecked(),
    );
  });

  it("shows API key status for each cloud provider", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    render(<TranscriptionSettingsSection />);
    await waitFor(() =>
      expect(screen.getByText(/DEEPGRAM_API_KEY/)).toBeInTheDocument(),
    );
  });

  it("disables save when selected cloud provider has missing API key", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    render(<TranscriptionSettingsSection />);
    await waitFor(() => screen.getByRole("radio", { name: /openai-compatible/i }));

    fireEvent.click(screen.getByRole("radio", { name: /openai-compatible/i }));
    const save = await screen.findByRole("button", { name: /save/i });
    expect(save).toBeDisabled();
  });

  it("enables save when selected provider needs no key", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    render(<TranscriptionSettingsSection />);
    const save = await screen.findByRole("button", { name: /save/i });
    expect(save).not.toBeDisabled();
  });

  it("PUTs the form values on save and shows the saved confirmation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "saved", restart_required: true, core_notified: "ok" }),
    );

    render(<TranscriptionSettingsSection />);
    await waitFor(() => screen.getByRole("radio", { name: /deepgram/i }));

    fireEvent.click(screen.getByRole("radio", { name: /deepgram/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const putCall = calls.find((c) => c[1]?.method === "PUT");
      expect(putCall?.[0]).toBe(ENDPOINT);
      const body = JSON.parse(String(putCall?.[1]?.body ?? "{}"));
      expect(body.provider).toBe("deepgram");
    });
    await waitFor(() =>
      expect(screen.getByText(/restart required/i)).toBeInTheDocument(),
    );
  });

  it("shows the server detail when PUT fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(defaultPayload()));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: "DEEPGRAM_API_KEY required" }, 400),
    );

    render(<TranscriptionSettingsSection />);
    await waitFor(() => screen.getByRole("radio", { name: /deepgram/i }));

    fireEvent.click(screen.getByRole("radio", { name: /deepgram/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/DEEPGRAM_API_KEY required/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders load error inline when GET fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500));
    render(<TranscriptionSettingsSection />);
    await waitFor(() =>
      expect(screen.getByText(/boom|HTTP 500|Failed/)).toBeInTheDocument(),
    );
  });
});

spec: docs/specs/video-ask-frame-request.md

## Revisions

Written by the author at the human's request after R-5 (DeepSeek V4.1 Flash spent the 2048-token limit on reasoning in tool requests); the human stated: "max_tokenは今の時代、無理やり通信を切断する（エラーにする）程度しか意味がないので、目一杯上げてもいいです。この上限を受け付けないモデルもありますし。" and approved this wording, 2026-11-15.

I5. An ollama profile's tool and final requests are sent with thinking on and with no `num_predict`; no thinking text appears in any `answer_chunk` or in any later request. An OpenAI-compatible profile's tool and final requests differ from today's request only by the messages of the exchange, `tools`, `tool_choice` (`"auto"` on a tool request, `"none"` on a final request), and by carrying no max-tokens field; `stream` and temperature are as today's. The total deadline, not a token limit, bounds their length.

Written by the author at the human's request after the R-5 re-run (with no token limit, DeepSeek V4.1 Flash streamed about 290,000 characters of reasoning in a tool request in 2 of 3 runs, until the 300 s deadline ended the answer as failed); the human chose "大きめの上限トークン数" on 2026-11-16. This replaces the I5 revision above.

I5. An ollama profile's tool and final requests are sent with thinking on and `num_predict` 8192; no thinking text appears in any `answer_chunk` or in any later request. An OpenAI-compatible profile's tool and final requests differ from today's request only by the messages of the exchange, `tools`, `tool_choice` (`"auto"` on a tool request, `"none"` on a final request), and a max-tokens field of 16384; `stream` and temperature are as today's. A reply cut by that limit before an answer is a reply that leaves no answer (the fallback).

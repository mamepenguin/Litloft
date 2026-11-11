# Decisions

decision:
ran_in_app: yes
at: 71e9cd802aa146184a7e515215019c2cbab099b2
by: agent
evidence: Local stack (`docker compose up -d --build`, intelligence 9b58ec5), drive テスト画像, through :3000 and in headless Chromium. Before = the same container with app/search.py and app/config.py from aa67c10, the only app files that differ; its app tree hashed identical to aa67c10. `GET /search/compare` clip_vector before -> after: photo 0->50, picture 0->50, small 0->50, middle 0->50. `GET /search?q=flower&limit=50`: 5 results, none with a CLIP match -> 29, 24 with clip_thumbnail. `GET /search?q=dog&include_scene_clip=true&limit=50`: 11, no CLIP match -> 45, 34 clip_thumbnail. Every before result stayed, at the same score. Search page: flower 5->29 items, photo 29->50, dog 11->50, Thumbnail badges only after, all after the other matches; Scene search checkbox on dog 11->45 items, URL gains include_scene_clip=true. Popup flower: badges Transcript, Content, Transcript x3 -> the same five followed by Thumbnail x3. Unrelated word 量子力学: 50 Thumbnail on both builds. mode=recall flower, 19 results: file ids, scores and match types hashed identical on before and the first after run; a second after run, after a restart, hashed differently and was not compared item by item. Filters on after: drive 動画 returned only 動画; type=video returned only video. Visual badge type `clip` seen only through the API on after (person, robot with Scene search on). `GET /search?q=flower&limit=50` time, median of requests 2-6: 0.035 s before, 0.041 and 0.038 s after, below the 1 s line. No page errors or 5xx. Not produced, because ordinary use cannot: a failed CLIP embedding, a failed KNN. Screenshots: /private/tmp/claude-502/-Users-libre-Sources-video-share/c532cfae-bef4-4683-a233-b1ff16e5e518/scratchpad/r5/{before,after}-{flower,photo,dog,dog-scene,dog-toggle,quantum,popup-flower}.png. Tied scores changed order between restarts of the same 9b58ec5 build (flower, dog, 量子力学).
pending: none

## Production benchmark

Run 2026-11-01 with benchmark.py over the production index, read-only (its write probe was refused on each drive), baseline `aa67c10` against candidate `9b58ec5`. Every row of the bar in the spec passed. The videos drive is shown as "(not shown)".

```
== photos 3764
 POS                   baseline   zero=16 results=  524 hits=122 img20=220 kept=221/221
 POS                   candidate  zero= 0 results= 1374 hits=310 img20=559 kept=221/221
 POS, Scene search on  baseline   zero=23 results=   38 hits=17 img20=35 kept=36/36
 POS, Scene search on  candidate  zero= 7 results=  309 hits=111 img20=192 kept=36/36
 NEG                   baseline   zero= 0 results=  153 hits=- img20=106 kept=106/106
 NEG                   candidate  zero= 0 results=  153 hits=- img20=106 kept=106/106
 KW                    baseline   zero= 0 results=   38 hits=- img20=0 kept=38/38
 KW                    candidate  zero= 0 results=  536 hits=- img20=162 kept=38/38
 known metadata             sample=15 found 15->15 top5 15->15 top20 15->15 medn 1->51
 known tfidf_keywords       sample=1 found 0->0 top5 0->0 top20 0->0 medn 50->50
 known whisper              sample=10 found 10->10 top5 10->10 top20 10->10 medn 1.0->51.0
== main 6142
 POS                   baseline   zero= 0 results= 1125 hits=187 img20=60 kept=395/395
 POS                   candidate  zero= 0 results= 1879 hits=248 img20=166 kept=386/395
 POS, Scene search on  baseline   zero= 2 results=  991 hits=157 img20=4 kept=339/339
 POS, Scene search on  candidate  zero= 1 results= 1056 hits=161 img20=19 kept=339/339
 NEG                   baseline   zero= 0 results=   64 hits=- img20=20 kept=50/50
 NEG                   candidate  zero= 0 results=  246 hits=- img20=90 kept=50/50
 KW                    baseline   zero= 0 results=  298 hits=- img20=0 kept=142/142
 KW                    candidate  zero= 0 results=  612 hits=- img20=44 kept=142/142
 known metadata             sample=15 found 15->15 top5 15->15 top20 15->15 medn 2->49
 known text_content         sample=15 found 11->11 top5 9->9 top20 9->9 medn 3->51
 known tfidf_keywords       sample=15 found 15->15 top5 15->15 top20 15->15 medn 14->43
 known vision_description   sample=1 found 1->1 top5 1->1 top20 1->1 medn 1->50
 known whisper              sample=15 found 15->15 top5 15->15 top20 15->15 medn 1->51
== (not shown) 8586
 POS                   baseline   zero= 2 results=  856 hits=172 img20=20 kept=360/360
 POS                   candidate  zero= 0 results= 1761 hits=213 img20=120 kept=352/360
 POS, Scene search on  baseline   zero= 2 results=  819 hits=175 img20=15 kept=355/355
 POS, Scene search on  candidate  zero= 0 results= 1450 hits=189 img20=115 kept=342/355
 NEG                   baseline   zero= 0 results=   69 hits=- img20=20 kept=39/39
 NEG                   candidate  zero= 0 results=  278 hits=- img20=93 kept=39/39
 KW                    baseline   zero= 0 results=  285 hits=- img20=0 kept=158/158
 KW                    candidate  zero= 0 results=  677 hits=- img20=42 kept=156/158
 known metadata             sample=15 found 10->10 top5 9->9 top20 9->9 medn 13->53
 known text_content         sample=15 found 13->13 top5 13->13 top20 13->13 medn 3->51
 known tfidf_keywords       sample=15 found 8->8 top5 8->8 top20 8->8 medn 30->53
 known whisper              sample=15 found 15->15 top5 15->15 top20 15->15 medn 1->51
```

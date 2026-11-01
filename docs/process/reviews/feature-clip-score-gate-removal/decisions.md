# Decisions

decision:
ran_in_app:
at:
by:
evidence:

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

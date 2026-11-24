/** Shared by the fixture that draws the surfaces and the cases that measure them. */

export const READING = {
  passageFilename: "議事録-予算会議.md",
  passageSectionTitle: "第三章 予算の配分",
  passagePlain:
    "会議では来期の予算配分について長い議論が続き、最終的に研究開発へ重点を置く方針でまとまった。",
  passageKeyword: "猫の行動を観察した記録で、猫が窓辺で眠る時間を一週間かけて測った。",
  passageKeywordTerm: "猫",
  passageScreenText: "画面に映ったスライドの見出しと、その下に並ぶ三つの要点。",
  imageDocFilename: "設計メモ-画像検索.md",
  imageDocSectionTitle: "第二節 照合の手順",
  imageDocExcerpt: "画像から読み取った文字列を本文の段落と照らし合わせ、最も近い箇所を候補として示す。",
  comment: "この場面の説明はわかりやすかったが、後半の例はもう少し具体的だと助かる。",
  fileDescription:
    "この資料は四月の打ち合わせで配られたもので、各部署の予定と課題を一覧にまとめている。".repeat(6),
  fileDescriptionDraft: "編集中の説明文。打ち合わせの要点を三行ほどで書く。",
  collectionDescription: "週末に読み返したい論文と講演の記録を集めたリスト。",
  quickNote: "帰り道に思いついたこと。次の会議では予算の話を先にする。",
  summaryShort: "講義は記憶の仕組みを三つの段階に分けて説明している。",
  summaryLongParagraph:
    "前半では符号化と保持の違いを実験の例で示し、後半では想起の失敗がどのように起きるかを日常の場面に当てはめて論じている。",
  summaryLongItems: [
    "符号化と保持の違いを実験の例で示す。",
    "想起の失敗が起きる条件を三つ挙げる。",
  ],
  visualDescription: "夕方の庭で、木製の椅子の上に開いたままの本が置かれ、奥に低い垣根が見える。",
  pictureLines: ["本日の予定", "十時から定例会議、午後は資料の見直し。"],
  citationPrefix: "その前の段落では、",
  citationTarget: "記憶は三つの段階を経て定着する",
  citationSuffix: "と述べたうえで、例を挙げている。",
  askQuestion: "この講義で挙げられている三つの段階はそれぞれ何ですか?",
  findSnippet: "予算の配分を見直すという提案が出た。",
  matchSnippet: "講義の後半で記憶の定着について触れている箇所。",
} as const;

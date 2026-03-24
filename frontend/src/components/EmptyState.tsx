import { File, Search, RefreshCw, Star } from "lucide-react";

type EmptyVariant = "no-files" | "no-results" | "needs-scan" | "no-favorites";

const variants: Record<
  EmptyVariant,
  { icon: typeof File; title: string; description: string }
> = {
  "no-files": {
    icon: File,
    title: "ファイルがありません",
    description: "このフォルダにはまだファイルがありません。",
  },
  "no-results": {
    icon: Search,
    title: "一致するファイルが見つかりません",
    description: "検索条件を変更してください。",
  },
  "needs-scan": {
    icon: RefreshCw,
    title: "スキャンを実行してください",
    description: "ドライブのファイルを読み込みます。",
  },
  "no-favorites": {
    icon: Star,
    title: "お気に入りのファイルがありません",
    description: "星アイコンをクリックしてお気に入りに追加しましょう。",
  },
};

export function EmptyState({
  variant,
  action,
}: {
  variant: EmptyVariant;
  action?: { label: string; onClick: () => void };
}) {
  const { icon: Icon, title, description } = variants[variant];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={48} className="mb-4 text-text-muted" />
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

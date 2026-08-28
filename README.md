# gyomu-kaizen-app

[gyomu-kaizen](https://github.com/hatakeyamasw-dev/gyomu-kaizen)（業務改善プロジェクト群）のフロントエンド専用リポジトリ。ここに置くのはUIのコードのみで、実際の業務データは含まない。

データはすべて gyomu-kaizen（private）側にあり、各アプリはブラウザから GitHub Contents API 経由で読み書きする。閲覧・登録には、gyomu-kaizenリポジトリへのアクセス権を持つ GitHub Personal Access Token（fine-grained、対象リポジトリ: gyomu-kaizen、権限: Contents Read and write）が必要。

gyomu-kaizen自体はprivateリポジトリのためGitHub Pagesを直接使えない（Freeプランではprivate repoのPagesは非対応）。そのため、コードだけをこの公開リポジトリに分離してPagesで公開している。

## アプリ一覧

| パス | 概要 |
|---|---|
| [qa-log/](qa-log/) | 仕事用Q&A蓄積ツール。キーワードごとに「気をつけること」を複数登録・閲覧できる |

## セットアップ（このリポジトリ自体）

1. Settings → Pages → Source: Deploy from a branch / `main` / `/ (root)` を選択して有効化
2. 公開後、`https://hatakeyamasw-dev.github.io/gyomu-kaizen-app/qa-log/` からアプリにアクセス
3. 初回アクセス時、画面上部の設定パネルにGitHub Personal Access Tokenを入力・保存する（端末ごとに1回でよい。トークンはその端末のブラウザにのみ保存され、コードには含まれない）

## 現状の制約

- qa-logが読み書きするgyomu-kaizen側のブランチは `main`。
- 複数端末から同時に登録すると、後勝ちで上書きされる可能性がある（個人利用前提のため未対策）。

// qa-log: 仕事用Q&A蓄積ツール
// データはこのアプリには保存されない。すべて GitHub Contents API 経由で
// hatakeyamasw-dev/gyomu-kaizen (private) の tools/qa-log/data/qa.json を読み書きする。

const CONFIG = {
  owner: "hatakeyamasw-dev",
  repo: "gyomu-kaizen",
  // データ保存先ブランチ。mainへの統合が済んだら "main" 等に変更する。
  branch: "claude/gyomu-kaizen-repo-check-la16xn",
  path: "tools/qa-log/data/qa.json",
};

const PAT_KEY = "gk_qa_log_pat";

const el = {
  patInput: document.getElementById("pat-input"),
  patSave: document.getElementById("pat-save"),
  patStatus: document.getElementById("pat-status"),
  settingsPanel: document.getElementById("settings-panel"),
  settingsSummary: document.getElementById("settings-summary"),
  tabBrowse: document.getElementById("tab-browse"),
  tabRegister: document.getElementById("tab-register"),
  viewBrowse: document.getElementById("view-browse"),
  viewRegister: document.getElementById("view-register"),
  searchInput: document.getElementById("search-input"),
  browseStatus: document.getElementById("browse-status"),
  results: document.getElementById("results"),
  form: document.getElementById("register-form"),
  regKeyword: document.getElementById("reg-keyword"),
  keywordList: document.getElementById("keyword-list"),
  regTags: document.getElementById("reg-tags"),
  regDate: document.getElementById("reg-date"),
  regSource: document.getElementById("reg-source"),
  pointsContainer: document.getElementById("points-container"),
  addPointBtn: document.getElementById("add-point"),
  registerStatus: document.getElementById("register-status"),
  pointRowTemplate: document.getElementById("point-row-template"),
};

let currentEntries = [];
let currentSha = null;

function getPat() {
  return localStorage.getItem(PAT_KEY) || "";
}

function setPat(value) {
  localStorage.setItem(PAT_KEY, value);
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str.replace(/\n/g, "")), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function b64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode("0x" + p1))
  );
}

function apiUrl() {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`;
}

async function fetchEntries() {
  const pat = getPat();
  if (!pat) throw new Error("先に設定パネルでGitHub Personal Access Tokenを保存してください。");

  const res = await fetch(`${apiUrl()}?ref=${encodeURIComponent(CONFIG.branch)}&_=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (res.status === 404) {
    // ファイルがまだ存在しない場合は空配列として扱う
    return { sha: null, entries: [] };
  }
  if (!res.ok) {
    throw new Error(`データ取得に失敗しました (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const text = b64DecodeUnicode(json.content);
  return { sha: json.sha, entries: JSON.parse(text) };
}

async function saveEntries(entries, sha, message) {
  const pat = getPat();
  if (!pat) throw new Error("先に設定パネルでGitHub Personal Access Tokenを保存してください。");

  const body = {
    message,
    content: b64EncodeUnicode(JSON.stringify(entries, null, 2) + "\n"),
    branch: CONFIG.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`保存に失敗しました (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderResults(query) {
  const q = (query || "").trim().toLowerCase();

  const matches = currentEntries.filter((entry) => {
    if (!q) return true;
    const haystack = [
      entry.keyword,
      ...(entry.tags || []),
      ...(entry.points || []).flatMap((p) => [p.label, p.detail, p.evidence]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  // 更新が新しいものを上に
  matches.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  el.results.innerHTML = "";

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = q ? "該当するエントリがありません。" : "まだ登録がありません。「登録」タブから追加してください。";
    el.results.appendChild(empty);
    return;
  }

  for (const entry of matches) {
    el.results.appendChild(renderEntryCard(entry));
  }
}

function renderEntryCard(entry) {
  const card = document.createElement("div");
  card.className = "entry-card";

  const h3 = document.createElement("h3");
  h3.textContent = entry.keyword;
  card.appendChild(h3);

  if (entry.tags && entry.tags.length) {
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    for (const tag of entry.tags) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag;
      meta.appendChild(chip);
    }
    card.appendChild(meta);
  }

  for (const point of entry.points || []) {
    const pointEl = document.createElement("div");
    pointEl.className = "point";

    if (point.label) {
      const label = document.createElement("div");
      label.className = "point-label";
      label.textContent = point.label;
      pointEl.appendChild(label);
    }

    const detail = document.createElement("div");
    detail.className = "point-detail";
    detail.textContent = point.detail || "";
    pointEl.appendChild(detail);

    if (point.evidence) {
      const evidence = document.createElement("div");
      evidence.className = "point-evidence";
      evidence.textContent = `根拠: ${point.evidence}`;
      pointEl.appendChild(evidence);
    }

    card.appendChild(pointEl);
  }

  if (entry.source) {
    const source = document.createElement("div");
    source.className = "entry-source";
    source.textContent = `参照元: ${entry.source}`;
    card.appendChild(source);
  }

  return card;
}

function updateKeywordList() {
  el.keywordList.innerHTML = "";
  const keywords = [...new Set(currentEntries.map((e) => e.keyword))];
  for (const kw of keywords) {
    const opt = document.createElement("option");
    opt.value = kw;
    el.keywordList.appendChild(opt);
  }
}

async function loadAndRender() {
  el.browseStatus.textContent = "読み込み中...";
  el.browseStatus.className = "status";
  try {
    const { sha, entries } = await fetchEntries();
    currentSha = sha;
    currentEntries = entries;
    updateKeywordList();
    renderResults(el.searchInput.value);
    el.browseStatus.textContent = "";
  } catch (err) {
    el.browseStatus.textContent = err.message;
    el.browseStatus.className = "status error";
  }
}

function addPointRow(prefill) {
  const fragment = el.pointRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".point-row");
  if (prefill) {
    row.querySelector(".point-label-input").value = prefill.label || "";
    row.querySelector(".point-detail-input").value = prefill.detail || "";
    row.querySelector(".point-evidence-input").value = prefill.evidence || "";
  }
  row.querySelector(".remove-point").addEventListener("click", () => {
    // 最低1行は残す
    if (el.pointsContainer.querySelectorAll(".point-row").length > 1) {
      row.remove();
    }
  });
  el.pointsContainer.appendChild(row);
}

function resetForm() {
  el.form.reset();
  el.regDate.value = new Date().toISOString().slice(0, 10);
  el.pointsContainer.innerHTML = "";
  addPointRow();
}

async function handleSubmit(e) {
  e.preventDefault();
  el.registerStatus.textContent = "保存中...";
  el.registerStatus.className = "status";

  const keyword = el.regKeyword.value.trim();
  const tags = el.regTags.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const date = el.regDate.value || new Date().toISOString().slice(0, 10);
  const source = el.regSource.value.trim();

  const rows = [...el.pointsContainer.querySelectorAll(".point-row")];
  const points = rows
    .map((row) => ({
      label: row.querySelector(".point-label-input").value.trim(),
      detail: row.querySelector(".point-detail-input").value.trim(),
      evidence: row.querySelector(".point-evidence-input").value.trim(),
    }))
    .filter((p) => p.detail);

  if (!keyword) {
    el.registerStatus.textContent = "キーワードを入力してください。";
    el.registerStatus.className = "status error";
    return;
  }
  if (points.length === 0) {
    el.registerStatus.textContent = "気をつけることを少なくとも1件入力してください。";
    el.registerStatus.className = "status error";
    return;
  }

  try {
    // 最新データを取り直してから追記する（他端末での更新との衝突を避ける）
    const { sha, entries } = await fetchEntries();
    const now = new Date().toISOString();
    const existing = entries.find((entry) => entry.keyword === keyword);

    let message;
    if (existing) {
      existing.points.push(...points);
      if (tags.length) existing.tags = [...new Set([...(existing.tags || []), ...tags])];
      if (source) existing.source = existing.source ? `${existing.source}\n${source}` : source;
      message = `qa-log: ${keyword} に${points.length}件追加`;
    } else {
      entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        keyword,
        tags,
        date,
        points,
        source,
        created_at: now,
      });
      message = `qa-log: ${keyword} を新規登録`;
    }

    await saveEntries(entries, sha, message);
    currentEntries = entries;
    currentSha = null;
    updateKeywordList();

    el.registerStatus.textContent = "保存しました。";
    el.registerStatus.className = "status ok";
    resetForm();

    // 閲覧タブに反映
    renderResults(el.searchInput.value);
  } catch (err) {
    el.registerStatus.textContent = err.message;
    el.registerStatus.className = "status error";
  }
}

function switchTab(tab) {
  const isBrowse = tab === "browse";
  el.tabBrowse.classList.toggle("active", isBrowse);
  el.tabRegister.classList.toggle("active", !isBrowse);
  el.viewBrowse.classList.toggle("active", isBrowse);
  el.viewRegister.classList.toggle("active", !isBrowse);
  if (isBrowse) loadAndRender();
}

function init() {
  const savedPat = getPat();
  if (savedPat) {
    el.patInput.value = savedPat;
    el.patStatus.textContent = "保存済みのトークンを使用します。";
    el.settingsPanel.removeAttribute("open");
  } else {
    el.settingsPanel.setAttribute("open", "");
    el.patStatus.textContent = "未設定です。gyomu-kaizenへの読み書き権限を持つトークンを入力してください。";
  }

  el.patSave.addEventListener("click", () => {
    setPat(el.patInput.value.trim());
    el.patStatus.textContent = "保存しました。";
    el.patStatus.className = "status ok";
    loadAndRender();
  });

  el.tabBrowse.addEventListener("click", () => switchTab("browse"));
  el.tabRegister.addEventListener("click", () => switchTab("register"));
  el.searchInput.addEventListener("input", () => renderResults(el.searchInput.value));
  el.addPointBtn.addEventListener("click", () => addPointRow());
  el.form.addEventListener("submit", handleSubmit);

  resetForm();
  if (savedPat) loadAndRender();
}

init();

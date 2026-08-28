// qa-log: 仕事用Q&A蓄積ツール
// データはこのアプリには保存されない。すべて GitHub Contents API 経由で
// hatakeyamasw-dev/gyomu-kaizen (private) の tools/qa-log/data/qa.json を読み書きする。

const CONFIG = {
  owner: "hatakeyamasw-dev",
  repo: "gyomu-kaizen",
  branch: "main",
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
  regRelated: document.getElementById("reg-related"),
  regDate: document.getElementById("reg-date"),
  regSource: document.getElementById("reg-source"),
  pointsContainer: document.getElementById("points-container"),
  addPointBtn: document.getElementById("add-point"),
  registerStatus: document.getElementById("register-status"),
  pointRowTemplate: document.getElementById("point-row-template"),
  editBanner: document.getElementById("edit-banner"),
  editBannerText: document.getElementById("edit-banner-text"),
  cancelEditBtn: document.getElementById("cancel-edit"),
  submitBtn: document.getElementById("submit-btn"),
  deleteEntryBtn: document.getElementById("delete-entry-btn"),
};

let currentEntries = [];
let currentSha = null;
let editingEntryId = null;

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

function apiUrl(path) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path || CONFIG.path}`;
}

const imageCache = new Map();

function resizeImageFile(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の変換に失敗しました。"));
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

async function uploadImage(blob) {
  const pat = getPat();
  if (!pat) throw new Error("先に設定パネルでGitHub Personal Access Tokenを保存してください。");

  const path = `tools/qa-log/data/images/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
  const base64 = await blobToBase64(blob);

  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `qa-log: 画像を追加 (${path.split("/").pop()})`,
      content: base64,
      branch: CONFIG.branch,
    }),
  });

  if (!res.ok) {
    throw new Error(`画像のアップロードに失敗しました (${res.status}): ${await res.text()}`);
  }
  return path;
}

async function fetchImageAsObjectUrl(path) {
  if (imageCache.has(path)) return imageCache.get(path);

  const pat = getPat();
  const res = await fetch(`${apiUrl(path)}?ref=${encodeURIComponent(CONFIG.branch)}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("画像の取得に失敗しました。");
  const json = await res.json();
  const byteChars = atob(json.content.replace(/\n/g, ""));
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  imageCache.set(path, url);
  return url;
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
      ...(entry.relatedKeywords || []),
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

  const head = document.createElement("div");
  head.className = "entry-card-head";

  const h3 = document.createElement("h3");
  h3.textContent = entry.keyword;
  head.appendChild(h3);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "secondary edit-entry-btn";
  editBtn.textContent = "編集";
  editBtn.addEventListener("click", () => startEdit(entry));
  head.appendChild(editBtn);

  card.appendChild(head);

  if (entry.tags && entry.tags.length) {
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    entry.tags.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = i % 2 === 0 ? "tag-chip" : "tag-chip alt";
      chip.textContent = tag;
      meta.appendChild(chip);
    });
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

    if (point.evidenceImage) {
      const img = document.createElement("img");
      img.className = "point-evidence-image";
      img.alt = point.label || entry.keyword;
      img.loading = "lazy";
      fetchImageAsObjectUrl(point.evidenceImage)
        .then((url) => {
          img.src = url;
          img.addEventListener("click", () => window.open(url, "_blank"));
        })
        .catch(() => {
          img.replaceWith(document.createTextNode("（画像の読み込みに失敗しました）"));
        });
      pointEl.appendChild(img);
    }

    card.appendChild(pointEl);
  }

  if (entry.source) {
    const source = document.createElement("div");
    source.className = "entry-source";
    source.textContent = `参照元: ${entry.source}`;
    card.appendChild(source);
  }

  if (entry.relatedKeywords && entry.relatedKeywords.length) {
    const relatedSection = document.createElement("div");
    relatedSection.className = "related-section";
    const label = document.createElement("span");
    label.className = "related-label";
    label.textContent = "関連:";
    relatedSection.appendChild(label);
    for (const kw of entry.relatedKeywords) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "related-chip";
      chip.textContent = kw;
      chip.addEventListener("click", () => {
        el.searchInput.value = kw;
        renderResults(kw);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      relatedSection.appendChild(chip);
    }
    card.appendChild(relatedSection);
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
  row._imageState = { existingPath: (prefill && prefill.evidenceImage) || "", pendingBlob: null, removed: false };

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

  const preview = row.querySelector(".point-image-preview");
  const fileInput = row.querySelector(".point-image-input");
  const removeImageBtn = row.querySelector(".remove-point-image");

  const showPreview = (src) => {
    preview.src = src;
    preview.style.display = "block";
    removeImageBtn.style.display = "inline-block";
  };

  if (row._imageState.existingPath) {
    fetchImageAsObjectUrl(row._imageState.existingPath)
      .then(showPreview)
      .catch(() => {});
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const blob = await resizeImageFile(file);
      row._imageState.pendingBlob = blob;
      row._imageState.removed = false;
      showPreview(URL.createObjectURL(blob));
    } catch (err) {
      alert(err.message);
    }
  });

  removeImageBtn.addEventListener("click", () => {
    row._imageState.pendingBlob = null;
    row._imageState.removed = true;
    fileInput.value = "";
    preview.style.display = "none";
    removeImageBtn.style.display = "none";
  });

  el.pointsContainer.appendChild(row);
}

function resetForm() {
  el.form.reset();
  el.regDate.value = new Date().toISOString().slice(0, 10);
  el.pointsContainer.innerHTML = "";
  addPointRow();
}

function startEdit(entry) {
  editingEntryId = entry.id;
  el.regKeyword.value = entry.keyword;
  el.regTags.value = (entry.tags || []).join(", ");
  el.regRelated.value = (entry.relatedKeywords || []).join(", ");
  el.regDate.value = entry.date || new Date().toISOString().slice(0, 10);
  el.regSource.value = entry.source || "";
  el.pointsContainer.innerHTML = "";
  for (const point of entry.points || []) addPointRow(point);
  if ((entry.points || []).length === 0) addPointRow();

  el.editBanner.style.display = "flex";
  el.editBannerText.textContent = `「${entry.keyword}」を編集中`;
  el.submitBtn.textContent = "更新";
  el.deleteEntryBtn.style.display = "inline-block";
  el.registerStatus.textContent = "";

  switchTab("register");
}

function exitEditMode() {
  editingEntryId = null;
  el.editBanner.style.display = "none";
  el.submitBtn.textContent = "保存";
  el.deleteEntryBtn.style.display = "none";
  resetForm();
}

async function deleteCurrentEntry() {
  if (!editingEntryId) return;
  const keyword = el.regKeyword.value.trim();
  if (!confirm(`「${keyword}」を削除します。よろしいですか？`)) return;

  el.registerStatus.textContent = "削除中...";
  el.registerStatus.className = "status";
  try {
    const { sha, entries } = await fetchEntries();
    const filtered = entries.filter((entry) => entry.id !== editingEntryId);
    await saveEntries(filtered, sha, `qa-log: ${keyword} を削除`);
    currentEntries = filtered;
    updateKeywordList();

    exitEditMode();
    switchTab("browse");
  } catch (err) {
    el.registerStatus.textContent = err.message;
    el.registerStatus.className = "status error";
  }
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
  const relatedKeywords = el.regRelated.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const date = el.regDate.value || new Date().toISOString().slice(0, 10);
  const source = el.regSource.value.trim();

  const rows = [...el.pointsContainer.querySelectorAll(".point-row")];
  const hasValidPoint = rows.some((row) => row.querySelector(".point-detail-input").value.trim());

  if (!keyword) {
    el.registerStatus.textContent = "キーワードを入力してください。";
    el.registerStatus.className = "status error";
    return;
  }
  if (!hasValidPoint) {
    el.registerStatus.textContent = "気をつけることを少なくとも1件入力してください。";
    el.registerStatus.className = "status error";
    return;
  }

  try {
    // 画像のアップロードを先に済ませてからpointsを組み立てる
    const points = [];
    for (const row of rows) {
      const detail = row.querySelector(".point-detail-input").value.trim();
      if (!detail) continue;
      const label = row.querySelector(".point-label-input").value.trim();
      const evidence = row.querySelector(".point-evidence-input").value.trim();
      let evidenceImage = row._imageState.existingPath;
      if (row._imageState.pendingBlob) {
        el.registerStatus.textContent = "画像をアップロード中...";
        evidenceImage = await uploadImage(row._imageState.pendingBlob);
      } else if (row._imageState.removed) {
        evidenceImage = "";
      }
      points.push({ label, detail, evidence, evidenceImage });
    }

    el.registerStatus.textContent = "保存中...";

    // 最新データを取り直してから更新する（他端末での更新との衝突を避ける）
    const { sha, entries } = await fetchEntries();
    const now = new Date().toISOString();

    let message;
    if (editingEntryId) {
      const idx = entries.findIndex((entry) => entry.id === editingEntryId);
      if (idx === -1) throw new Error("編集対象のエントリが見つかりませんでした（他端末で削除された可能性があります）。");
      entries[idx] = { ...entries[idx], keyword, tags, relatedKeywords, date, points, source };
      message = `qa-log: ${keyword} を更新`;
    } else {
      const existing = entries.find((entry) => entry.keyword === keyword);
      if (existing) {
        existing.points.push(...points);
        if (tags.length) existing.tags = [...new Set([...(existing.tags || []), ...tags])];
        if (relatedKeywords.length) {
          existing.relatedKeywords = [...new Set([...(existing.relatedKeywords || []), ...relatedKeywords])];
        }
        if (source) existing.source = existing.source ? `${existing.source}\n${source}` : source;
        message = `qa-log: ${keyword} に${points.length}件追加`;
      } else {
        entries.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          keyword,
          tags,
          relatedKeywords,
          date,
          points,
          source,
          created_at: now,
        });
        message = `qa-log: ${keyword} を新規登録`;
      }
    }

    await saveEntries(entries, sha, message);
    currentEntries = entries;
    currentSha = null;
    updateKeywordList();

    const wasEditing = Boolean(editingEntryId);
    exitEditMode();
    el.registerStatus.textContent = wasEditing ? "更新しました。" : "保存しました。";
    el.registerStatus.className = "status ok";

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
  el.cancelEditBtn.addEventListener("click", () => exitEditMode());
  el.deleteEntryBtn.addEventListener("click", () => deleteCurrentEntry());

  resetForm();
  if (savedPat) loadAndRender();
}

init();

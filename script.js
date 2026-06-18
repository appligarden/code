const codeInput = document.getElementById("codeInput");
const codeType = document.getElementById("codeType");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const resultList = document.getElementById("resultList");
const summary = document.getElementById("summary");

let latestResults = [];

analyzeBtn.addEventListener("click", () => {
  const text = codeInput.value;

  if (!text.trim()) {
    showEmpty("コードが空です。貼ってから解析してくれ。");
    return;
  }

  const type = detectType(text, codeType.value);
  const results = analyze(text, type);

  latestResults = results;
  renderResults(results, type);
});

clearBtn.addEventListener("click", () => {
  codeInput.value = "";
  latestResults = [];
  resultList.innerHTML = "";
  summary.textContent = "まだ解析されていません。";
});

copyBtn.addEventListener("click", async () => {
  if (!latestResults.length) {
    return;
  }

  const text = latestResults
    .map((item, index) => {
      return `${index + 1}. [${item.type}] ${item.name} / ${item.line}行目`;
    })
    .join("\n");

  await navigator.clipboard.writeText(text);
  copyBtn.textContent = "コピー済み";
  setTimeout(() => {
    copyBtn.textContent = "結果をコピー";
  }, 1200);
});

function detectType(text, selectedType) {
  if (selectedType !== "auto") {
    return selectedType;
  }

  if (/<[a-z][\s\S]*>/i.test(text)) {
    return "html";
  }

  if (/@media|#[a-zA-Z0-9_-]+\s*\{|\.([a-zA-Z0-9_-]+)\s*\{/.test(text)) {
    return "css";
  }

  return "js";
}

function analyze(text, type) {
  if (type === "js") {
    return analyzeJavaScript(text);
  }

  if (type === "css") {
    return analyzeCSS(text);
  }

  if (type === "html") {
    return analyzeHTML(text);
  }

  return [];
}

function analyzeJavaScript(text) {
  const lines = text.split("\n");
  const results = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("//")) {
      return;
    }

    const normalFunction = trimmed.match(/^function\s+([a-zA-Z0-9_$]+)\s*\(/);
    const asyncFunction = trimmed.match(/^async\s+function\s+([a-zA-Z0-9_$]+)\s*\(/);
    const arrowFunction = trimmed.match(/^(const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s*)?\(?/);
    const eventListener = trimmed.match(/([a-zA-Z0-9_$]+)\.addEventListener\s*\(\s*["'](.+?)["']/);
    const importLine = trimmed.match(/^import\s+/);

    if (importLine) {
      results.push(makeItem("import", "import文", index));
      return;
    }

    if (asyncFunction) {
      results.push(makeItem("async function", asyncFunction[1], index));
      return;
    }

    if (normalFunction) {
      results.push(makeItem("function", normalFunction[1], index));
      return;
    }

    if (
      arrowFunction &&
      trimmed.includes("=>")
    ) {
      results.push(makeItem("arrow function", arrowFunction[2], index));
      return;
    }

    if (eventListener) {
      results.push(makeItem("event", `${eventListener[1]} / ${eventListener[2]}`, index));
    }
  });

  return mergeImportGroup(results);
}

function analyzeCSS(text) {
  const lines = text.split("\n");
  const results = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("* /")) {
      return;
    }

    if (trimmed.startsWith("@media")) {
      results.push(makeItem("@media", trimmed, index));
      return;
    }

    if (trimmed.startsWith("@keyframes")) {
      results.push(makeItem("@keyframes", trimmed.replace("{", "").trim(), index));
      return;
    }

    if (
      trimmed.endsWith("{") &&
      !trimmed.includes(":") &&
      !trimmed.startsWith("@")
    ) {
      const selector = trimmed.replace("{", "").trim();
      results.push(makeItem("selector", selector, index));
    }
  });

  return results;
}

function analyzeHTML(text) {
  const lines = text.split("\n");
  const results = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("<!--")) {
      return;
    }

    const sectionTag = trimmed.match(/^<(header|main|section|article|footer|nav|form|div)\b/i);
    const headingTag = trimmed.match(/^<(h1|h2|h3)\b/i);
    const scriptTag = trimmed.match(/^<script\b/i);
    const linkTag = trimmed.match(/^<link\b/i);

    if (sectionTag) {
      const id = trimmed.match(/id=["']([^"']+)["']/);
      const className = trimmed.match(/class=["']([^"']+)["']/);

      let name = `<${sectionTag[1]}>`;

      if (id) {
        name += ` #${id[1]}`;
      }

      if (className) {
        name += ` .${className[1]}`;
      }

      results.push(makeItem("block", name, index));
      return;
    }

    if (headingTag) {
      results.push(makeItem("heading", trimmed.replace(/<[^>]+>/g, "").trim() || `<${headingTag[1]}>`, index));
      return;
    }

    if (scriptTag) {
      results.push(makeItem("script", trimmed, index));
      return;
    }

    if (linkTag) {
      results.push(makeItem("link", trimmed, index));
    }
  });

  return results;
}

function makeItem(type, name, index) {
  return {
    type,
    name,
    line: index + 1
  };
}

function mergeImportGroup(results) {
  const merged = [];
  let importStarted = false;
  let firstImportLine = null;

  results.forEach((item) => {
    if (item.type === "import") {
      if (!importStarted) {
        importStarted = true;
        firstImportLine = item.line;
        merged.push({
          type: "import",
          name: "import群",
          line: firstImportLine
        });
      }
      return;
    }

    merged.push(item);
  });

  return merged;
}

function renderResults(results, type) {
  resultList.innerHTML = "";

  if (!results.length) {
    showEmpty("拾える構造が見つかりませんでした。");
    return;
  }

  summary.textContent = `${getTypeName(type)}として解析しました。${results.length}件見つかりました。`;

  results.forEach((item) => {
    const li = document.createElement("li");
    li.className = "result-item";

    li.innerHTML = `
      <span class="badge">${escapeHTML(item.type)}</span>
      <span class="name">${escapeHTML(item.name)}</span>
      <span class="line">${item.line}行目</span>
    `;

    resultList.appendChild(li);
  });
}

function showEmpty(message) {
  resultList.innerHTML = `<li class="empty">${escapeHTML(message)}</li>`;
  summary.textContent = message;
}

function getTypeName(type) {
  if (type === "js") return "JavaScript";
  if (type === "css") return "CSS";
  if (type === "html") return "HTML";
  return "コード";
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

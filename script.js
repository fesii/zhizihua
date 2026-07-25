const content = document.querySelector("#content");
const timeTabs = document.querySelector("#time-tabs");
const copyAllButton = document.querySelector("#copy-all-prices");
const historyDateInput = document.querySelector("#history-date");
const historySearchButton = document.querySelector("#history-search");
const historyCopyButton = document.querySelector("#history-copy");
const historyResult = document.querySelector("#history-result");
const sectionTemplate = document.querySelector("#section-template");
const groupTemplate = document.querySelector("#group-template");
const itemTemplate = document.querySelector("#item-template");
let appData = null;
let selectedTime = "";
let historyData = { records: [] };
let selectedHistoryRecord = null;

async function loadData() {
  const response = await fetch(`./data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("公告数据读取失败");
  }
  return response.json();
}

async function loadHistory() {
  const response = await fetch(`./history.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return { records: [] };
  return response.json();
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
}

function normalizeDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDate(value) {
  const text = String(value || "");
  const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (full) return normalizeDate(full[1], full[2], full[3]);

  const short = text.match(/(^|[^\d])(\d{1,2})[./月](\d{1,2})(日)?($|[^\d])/);
  if (short) return normalizeDate(new Date().getFullYear(), short[2], short[3]);

  return "";
}

function normalizeTime(value) {
  return String(value || "").replace(".", ":").padStart(5, "0");
}

function getBusinessDate() {
  const pages = appData.pages || [];
  const midnightPage = pages.find((page) => normalizeTime(page.time) === "00:00");
  return extractDate(midnightPage && midnightPage.updatedAt) || extractDate(appData.updatedAt);
}

function renderTimeTabs(pages, activeTime) {
  timeTabs.replaceChildren();
  const date = getBusinessDate();
  pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = [date, page.time].filter(Boolean).join(" ");
    button.className = page.time === activeTime ? "active" : "";
    button.addEventListener("click", () => {
      selectedTime = page.time;
      renderPage();
    });
    timeTabs.append(button);
  });
}

function collectSectionItems(section) {
  const items = [];
  (section.groups || []).forEach((group) => {
    (group.items || []).forEach((item) => {
      items.push({
        label: item.label || "",
        value: item.value || ""
      });
    });
  });
  return items;
}

function getSelectedPageIndex() {
  const pages = appData.pages || [];
  return pages.findIndex((page) => page.time === selectedTime);
}

function getPreviousPageForSelectedTime() {
  const pages = appData.pages || [];
  const index = getSelectedPageIndex();
  if (index > 0) return pages[index - 1];
  return null;
}

function findItemValueInPage(page, label) {
  if (!page || !label) return "";
  for (const section of page.sections || []) {
    for (const group of section.groups || []) {
      for (const item of group.items || []) {
        if (item.label === label || item.label.includes(label) || label.includes(item.label)) {
          return String(item.value || "");
        }
      }
    }
  }
  return "";
}

function isItemChangedFromPrevious(item) {
  const previousValue = findItemValueInPage(getPreviousPageForSelectedTime(), item.label);
  if (!previousValue) return false;
  return String(item.value || "") !== previousValue;
}

function collectAllItemsByLabel(sectionTitle = "") {
  const linesByLabel = new Map();

  (appData.pages || []).forEach((page) => {
    (page.sections || []).forEach((section) => {
      if (sectionTitle && section.title !== sectionTitle) return;

      collectSectionItems(section).forEach((item) => {
        if (!item.label) return;
        if (!linesByLabel.has(item.label)) linesByLabel.set(item.label, []);
        linesByLabel.get(item.label).push(`${item.label}${page.time}/${item.value}`);
      });
    });
  });

  return linesByLabel;
}

function buildPriceTemplate(sectionTitle) {
  const linesByLabel = collectAllItemsByLabel(sectionTitle);

  return Array.from(linesByLabel.values())
    .flat()
    .join("\n");
}

function buildAllPriceTemplate() {
  const linesByLabel = collectAllItemsByLabel();
  return Array.from(linesByLabel.values())
    .flat()
    .join("\n");
}

async function copyToClipboard(text, button, defaultText) {
  await navigator.clipboard.writeText(text);
  button.textContent = "已复制";
  setTimeout(() => {
    button.textContent = defaultText;
  }, 1200);
}

function renderSections(sections) {
  content.replaceChildren();
  sections.forEach((section) => {
    const node = sectionTemplate.content.cloneNode(true);
    const panel = node.querySelector(".panel");
    const title = node.querySelector("h2");
    const meta = node.querySelector(".meta");
    const copyButton = node.querySelector(".copy-button");
    const groups = node.querySelector(".groups");

    panel.dataset.accent = section.accent || "blue";
    title.textContent = section.title;
    meta.textContent = [section.subtitle, section.linkText].filter(Boolean).join("  ");
    copyButton.textContent = "复制价格模板";
    copyButton.addEventListener("click", async () => {
      const template = buildPriceTemplate(section.title);
      await copyToClipboard(template || section.copyText || "", copyButton, "复制价格模板");
    });

    section.groups.forEach((group) => {
      const groupNode = groupTemplate.content.cloneNode(true);
      groupNode.querySelector("h3").textContent = group.name;
      const items = groupNode.querySelector(".items");

      group.items.forEach((item) => {
        const itemNode = itemTemplate.content.cloneNode(true);
        const itemCard = itemNode.querySelector(".item");
        itemCard.classList.toggle("highlight", Boolean(item.highlight));
        itemCard.classList.toggle("changed-price", isItemChangedFromPrevious(item));
        itemNode.querySelector(".label").textContent = item.label;
        itemNode.querySelector(".value").textContent = item.value;
        items.append(itemNode);
      });

      groups.append(groupNode);
    });

    content.append(node);
  });
}

function renderHistorySections(record) {
  historyResult.replaceChildren();
  selectedHistoryRecord = record || null;
  if (!record) {
    historyResult.innerHTML = `<div class="error">没有找到这一天的历史价格</div>`;
    return;
  }

  (record.pages || []).forEach((page) => {
    const wrap = document.createElement("article");
    wrap.className = "history-day";
    const title = document.createElement("h3");
    title.textContent = `${record.date} ${page.time}`;
    const note = document.createElement("p");
    note.textContent = page.updatedAt || "";
    const sectionWrap = document.createElement("div");
    sectionWrap.className = "content";

    (page.sections || []).forEach((section) => {
      const node = sectionTemplate.content.cloneNode(true);
      const panel = node.querySelector(".panel");
      const copyButton = node.querySelector(".copy-button");
      const groups = node.querySelector(".groups");

      panel.dataset.accent = section.accent || "blue";
      node.querySelector("h2").textContent = section.title;
      node.querySelector(".meta").textContent = [section.subtitle, section.linkText].filter(Boolean).join("  ");
      copyButton.remove();

      (section.groups || []).forEach((group) => {
        const groupNode = groupTemplate.content.cloneNode(true);
        groupNode.querySelector("h3").textContent = group.name;
        const items = groupNode.querySelector(".items");

        (group.items || []).forEach((item) => {
          const itemNode = itemTemplate.content.cloneNode(true);
          const itemCard = itemNode.querySelector(".item");
          itemCard.classList.toggle("highlight", Boolean(item.highlight));
          itemNode.querySelector(".label").textContent = item.label;
          itemNode.querySelector(".value").textContent = item.value;
          items.append(itemNode);
        });

        groups.append(groupNode);
      });

      sectionWrap.append(node);
    });

    wrap.append(title, note, sectionWrap);
    historyResult.append(wrap);
  });
}

function searchHistory() {
  const date = historyDateInput.value;
  if (!date) {
    selectedHistoryRecord = null;
    historyResult.innerHTML = `<div class="error">请先选择日期</div>`;
    return;
  }
  const record = (historyData.records || []).find((entry) => entry.date === date);
  renderHistorySections(record);
}

function buildHistoryPriceTemplate(record) {
  const linesByLabel = new Map();
  ((record && record.pages) || []).forEach((page) => {
    (page.sections || []).forEach((section) => {
      collectSectionItems(section).forEach((item) => {
        if (!item.label) return;
        if (!linesByLabel.has(item.label)) linesByLabel.set(item.label, []);
        linesByLabel.get(item.label).push(`${item.label}${page.time}/${item.value}`);
      });
    });
  });

  return Array.from(linesByLabel.values())
    .flat()
    .join("\n");
}

function getSelectedPage() {
  const pages = appData.pages || [];
  return pages.find((page) => page.time === selectedTime) || pages[0];
}

function renderPage() {
  const page = getSelectedPage();
  if (!page) {
    content.innerHTML = `<div class="error">data.json 中还没有配置任何时间价格</div>`;
    return;
  }

  renderTimeTabs(appData.pages || [], page.time);
  setText("#updated-at", page.updatedAt || page.time);
  setText("#notice-text", page.notice || "");
  renderSections(page.sections || []);
}

copyAllButton.addEventListener("click", async () => {
  await copyToClipboard(buildAllPriceTemplate(), copyAllButton, "复制全部价格模板");
});

historySearchButton.addEventListener("click", searchHistory);

historyCopyButton.addEventListener("click", async () => {
  if (!selectedHistoryRecord) {
    historyResult.innerHTML = `<div class="error">请先查询到某一天的历史价格</div>`;
    return;
  }
  await copyToClipboard(buildHistoryPriceTemplate(selectedHistoryRecord), historyCopyButton, "复制历史价格模板");
});

Promise.all([loadData(), loadHistory()])
  .then(([data, history]) => {
    appData = data;
    historyData = history || { records: [] };
    selectedTime = data.activeTime || ((data.pages && data.pages[0] && data.pages[0].time) || "");
    document.title = data.siteTitle || "公告平台";
    setText("#site-title", data.siteTitle);
    renderPage();
  })
  .catch((error) => {
    content.innerHTML = `<div class="error">${error.message}</div>`;
  });

const content = document.querySelector("#content");
const timeTabs = document.querySelector("#time-tabs");
const copyAllButton = document.querySelector("#copy-all-prices");
const sectionTemplate = document.querySelector("#section-template");
const groupTemplate = document.querySelector("#group-template");
const itemTemplate = document.querySelector("#item-template");
let appData = null;
let selectedTime = "";

async function loadData() {
  const response = await fetch(`./data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("公告数据读取失败");
  }
  return response.json();
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value || "";
}

function renderTimeTabs(pages, activeTime) {
  timeTabs.replaceChildren();
  pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = page.time;
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
        itemNode.querySelector(".label").textContent = item.label;
        itemNode.querySelector(".value").textContent = item.value;
        items.append(itemNode);
      });

      groups.append(groupNode);
    });

    content.append(node);
  });
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

loadData()
  .then((data) => {
    appData = data;
    selectedTime = data.activeTime || data.pages?.[0]?.time || "";
    document.title = data.siteTitle || "公告平台";
    setText("#site-title", data.siteTitle);
    renderPage();
  })
  .catch((error) => {
    content.innerHTML = `<div class="error">${error.message}</div>`;
  });

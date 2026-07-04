const timeTabs = document.querySelector("#time-tabs");
const editor = document.querySelector("#editor");
const statusText = document.querySelector("#save-status");
const siteTitleInput = document.querySelector("#site-title-input");
const activeTimeInput = document.querySelector("#active-time-input");
const openFileButton = document.querySelector("#open-file");
const saveFileButton = document.querySelector("#save-file");
const saveGithubButton = document.querySelector("#save-github");
const loadGithubButton = document.querySelector("#load-github");
const githubOwnerInput = document.querySelector("#github-owner");
const githubRepoInput = document.querySelector("#github-repo");
const githubBranchInput = document.querySelector("#github-branch");
const githubPathInput = document.querySelector("#github-path");
const githubTokenInput = document.querySelector("#github-token");
const addTimeButton = document.querySelector("#add-time");
const copyTimeButton = document.querySelector("#copy-time");
const deleteTimeButton = document.querySelector("#delete-time");
const pastePricesInput = document.querySelector("#paste-prices");
const importPricesButton = document.querySelector("#import-prices");
const clearImportButton = document.querySelector("#clear-import");
const pageTemplate = document.querySelector("#page-template");
const sectionTemplate = document.querySelector("#section-editor-template");
const groupTemplate = document.querySelector("#group-editor-template");
const itemTemplate = document.querySelector("#item-editor-template");

let appData = null;
let selectedTime = "";
let fileHandle = null;
let githubFileSha = "";

const GROUP_BY_LABEL = new Map([
  ["普通", "钱包整百"],
  ["加速", "钱包整百"],
  ["超速", "钱包整百"],
  ["高速", "钱包整百"],
  ["极速", "钱包整百"],
  ["秒拉", "钱包整百"],
  ["怪额", "钱包特殊"],
  ["超怪", "钱包特殊"],
  ["大额", "钱包特殊"]
]);

const GROUP_ORDER = ["钱包整百", "钱包特殊", "微信通道", "未分组"];

async function loadDefaultData() {
  const response = await fetch(`./data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("读取 data.json 失败");
  return response.json();
}

function setStatus(message) {
  statusText.textContent = message;
}

function getGithubConfig() {
  return {
    owner: githubOwnerInput.value.trim(),
    repo: githubRepoInput.value.trim(),
    branch: githubBranchInput.value.trim() || "main",
    path: githubPathInput.value.trim() || "data.json",
    token: githubTokenInput.value.trim()
  };
}

function getGithubApiUrl(config) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(config.path)}?ref=${encodeURIComponent(config.branch)}`;
}

function getGithubFileApiUrl(config, path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`;
}

function getHistoryPath() {
  const config = getGithubConfig();
  const parts = config.path.split("/");
  parts[parts.length - 1] = "history.json";
  return parts.join("/");
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToUtf8(text) {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(url, options = {}) {
  const config = getGithubConfig();
  if (!config.owner || !config.repo || !config.token) {
    throw new Error("请填写 GitHub 用户名、仓库名和 Token。");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `GitHub 请求失败：${response.status}`);
  }

  return response.json();
}

async function loadGithubContentFile(path) {
  const config = getGithubConfig();
  try {
    return await githubRequest(getGithubFileApiUrl(config, path));
  } catch (error) {
    if (String(error.message).includes("Not Found")) return null;
    throw error;
  }
}

async function saveGithubContentFile(path, content, message, sha = "") {
  const config = getGithubConfig();
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: utf8ToBase64(content),
    branch: config.branch
  };
  if (sha) body.sha = sha;
  return githubRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function getSelectedPage() {
  return appData.pages.find((page) => page.time === selectedTime) || appData.pages[0];
}

function normalizePrice(rawValue) {
  if (rawValue.includes(".")) return String(Number(rawValue));
  return String(Number(`0.${rawValue}`));
}

function getGroupName(label) {
  if (GROUP_BY_LABEL.has(label)) return GROUP_BY_LABEL.get(label);
  if (label.startsWith("微信")) return "微信通道";
  return "未分组";
}

function detectSectionTitle(text) {
  const cleanText = text.replace(/[（(][^）)]*[）)]/g, "");
  const lines = cleanText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ignoredTitles = new Set(["修改费率", "费率", "价格", "改价", "公告"]);
  return lines.find((line) => (
    /[\u4e00-\u9fa5A-Za-z]/.test(line)
    && !/\d/.test(line)
    && !ignoredTitles.has(line)
  )) || "";
}

function parsePastedPrices(text) {
  const cleanText = text
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/^\s*\d{1,2}(?:\.\d{1,2})?\s*$/gm, " ");
  const pattern = /([\u4e00-\u9fa5A-Za-z]+)\s*(\d+(?:\.\d+)?)/g;
  const groups = new Map();
  let match = pattern.exec(cleanText);

  while (match) {
    const label = match[1].trim();
    const value = normalizePrice(match[2]);
    const groupName = getGroupName(label);
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push({
      label,
      value,
      highlight: label === "秒拉"
    });
    match = pattern.exec(cleanText);
  }

  return GROUP_ORDER
    .filter((name) => groups.has(name))
    .map((name) => ({
      name,
      items: groups.get(name)
    }));
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDate(year, month, day) {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return `${year}-${paddedMonth}-${paddedDay}`;
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
  const midnightPage = (appData.pages || []).find((page) => normalizeTime(page.time) === "00:00");
  return extractDate(midnightPage?.updatedAt) || extractDate(appData.updatedAt) || new Date().toISOString().slice(0, 10);
}

async function archiveCurrentPricesToGithub() {
  const historyPath = getHistoryPath();
  const historyFile = await loadGithubContentFile(historyPath);
  const history = historyFile ? JSON.parse(base64ToUtf8(historyFile.content)) : { records: [] };
  const date = getBusinessDate();
  const record = {
    date,
    siteTitle: appData.siteTitle || "",
    activeTime: appData.activeTime || "",
    archivedAt: new Date().toISOString(),
    pages: cloneData(appData.pages || [])
  };

  history.records = (history.records || []).filter((entry) => entry.date !== date);
  history.records.push(record);
  history.records.sort((a, b) => a.date.localeCompare(b.date));

  await saveGithubContentFile(
    historyPath,
    JSON.stringify(history, null, 2),
    `Archive prices ${date}`,
    historyFile?.sha || ""
  );

  return date;
}

function countSectionItems(section) {
  return (section.groups || []).reduce((sum, group) => sum + (group.items || []).length, 0);
}

function createEmptySection(title) {
  return {
    title,
    subtitle: "网页入口",
    linkText: "",
    accent: "blue",
    groups: [],
    copyText: ""
  };
}

function isSameSectionTitle(left, right) {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function getPreviousPage(currentPage) {
  const pages = appData.pages || [];
  const index = pages.indexOf(currentPage);
  if (index > 0) return pages[index - 1];
  return pages.find((page) => page !== currentPage && countSectionItems({ groups: (page.sections || []).flatMap((section) => section.groups || []) }) > 0);
}

function findTemplateSection(currentPage) {
  const previousPage = getPreviousPage(currentPage);
  const previousSection = (previousPage?.sections || [])
    .filter((section) => countSectionItems(section) > 0)
    .sort((a, b) => countSectionItems(b) - countSectionItems(a))[0];

  if (previousSection) return cloneData(previousSection);

  const anySection = (appData.pages || [])
    .filter((page) => page !== currentPage)
    .flatMap((page) => page.sections || [])
    .filter((section) => countSectionItems(section) > 0)
    .sort((a, b) => countSectionItems(b) - countSectionItems(a))[0];

  return anySection ? cloneData(anySection) : createEmptySection("导入价格");
}

function findImportedForItem(itemLabel, importedByLabel) {
  if (importedByLabel.has(itemLabel)) {
    return [itemLabel, importedByLabel.get(itemLabel)];
  }

  for (const [label, imported] of importedByLabel.entries()) {
    if (itemLabel.includes(label) || label.includes(itemLabel)) {
      return [label, imported];
    }
  }

  return ["", null];
}

function mergeImportedGroups(section, importedGroups) {
  const importedByLabel = new Map();
  importedGroups.forEach((group) => {
    (group.items || []).forEach((item) => {
      importedByLabel.set(item.label, {
        ...item,
        groupName: group.name
      });
    });
  });

  const usedLabels = new Set();
  section.groups = section.groups || [];
  section.groups.forEach((group) => {
    group.items = (group.items || []).map((item) => {
      const [importedLabel, imported] = findImportedForItem(item.label, importedByLabel);
      if (!imported) return item;
      usedLabels.add(importedLabel);
      return {
        ...item,
        value: imported.value,
        highlight: imported.highlight || item.highlight
      };
    });
  });

  importedByLabel.forEach((item, label) => {
    if (usedLabels.has(label)) return;
    let group = section.groups.find((entry) => entry.name === item.groupName);
    if (!group) {
      group = { name: item.groupName, items: [] };
      section.groups.push(group);
    }
    group.items.push({
      label: item.label,
      value: item.value,
      highlight: item.highlight
    });
  });

  section.groups.sort((a, b) => {
    const left = GROUP_ORDER.indexOf(a.name);
    const right = GROUP_ORDER.indexOf(b.name);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });
}

function importPastedPrices() {
  const page = getSelectedPage();
  if (!page) {
    setStatus("请先新增或选择一个时间。");
    return;
  }

  const text = pastePricesInput.value.trim();
  if (!text) {
    setStatus("请先粘贴价格文字。");
    return;
  }

  const groups = parsePastedPrices(text);
  if (!groups.length) {
    setStatus("没有识别到价格，请检查格式，例如：普通875 加速88。");
    return;
  }

  page.sections = page.sections || [];
  let section = page.sections.find((entry) => countSectionItems(entry) > 0) || page.sections[0];
  if (!section) {
    section = findTemplateSection(page);
    page.sections.push(section);
  } else {
    const templateSection = findTemplateSection(page);
    if (countSectionItems(templateSection) > countSectionItems(section)) {
      mergeImportedGroups(templateSection, section.groups || []);
      const sectionIndex = page.sections.indexOf(section);
      templateSection.title = section.title;
      page.sections[sectionIndex] = templateSection;
      section = templateSection;
    }
  }

  mergeImportedGroups(section, groups);
  page.updatedAt = page.updatedAt || page.time;
  page.notice = page.notice || `${page.time} 价格已更新`;
  render();
  setStatus(`已识别并覆盖 ${groups.reduce((sum, group) => sum + group.items.length, 0)} 个价格，${page.time} 会保留完整通道。`);
}

function bindInput(element, object, field, afterChange) {
  element.value = object[field] || "";
  element.addEventListener("input", () => {
    object[field] = element.value;
    if (afterChange) afterChange();
  });
}

function bindCheckbox(element, object, field) {
  element.checked = Boolean(object[field]);
  element.addEventListener("change", () => {
    object[field] = element.checked;
  });
}

function renderTimeTabs() {
  timeTabs.replaceChildren();
  appData.pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = page.time;
    button.className = page.time === selectedTime ? "active" : "";
    button.addEventListener("click", () => {
      selectedTime = page.time;
      render();
    });
    timeTabs.append(button);
  });
}

function renderActiveTimeSelect() {
  activeTimeInput.replaceChildren();
  appData.pages.forEach((page) => {
    const option = document.createElement("option");
    option.value = page.time;
    option.textContent = page.time;
    activeTimeInput.append(option);
  });
  activeTimeInput.value = appData.activeTime || selectedTime;
}

function renderItem(item, items, group) {
  const node = itemTemplate.content.cloneNode(true);
  bindInput(node.querySelector('[data-field="label"]'), item, "label");
  bindInput(node.querySelector('[data-field="value"]'), item, "value");
  bindCheckbox(node.querySelector('[data-field="highlight"]'), item, "highlight");
  node.querySelector(".remove-item").addEventListener("click", () => {
    group.items = group.items.filter((entry) => entry !== item);
    render();
  });
  items.append(node);
}

function renderGroup(group, groups, section) {
  const node = groupTemplate.content.cloneNode(true);
  bindInput(node.querySelector('[data-field="name"]'), group, "name");
  const items = node.querySelector(".items");
  group.items = group.items || [];
  group.items.forEach((item) => renderItem(item, items, group));
  node.querySelector(".add-item").addEventListener("click", () => {
    group.items.push({ label: "新价格", value: "0.00" });
    render();
  });
  node.querySelector(".remove-group").addEventListener("click", () => {
    section.groups = section.groups.filter((entry) => entry !== group);
    render();
  });
  groups.append(node);
}

function renderSection(section, sectionList, page) {
  const node = sectionTemplate.content.cloneNode(true);
  bindInput(node.querySelector('[data-field="title"]'), section, "title");
  bindInput(node.querySelector('[data-field="subtitle"]'), section, "subtitle");
  bindInput(node.querySelector('[data-field="linkText"]'), section, "linkText");
  bindInput(node.querySelector('[data-field="copyText"]'), section, "copyText");
  bindInput(node.querySelector('[data-field="accent"]'), section, "accent");

  const groups = node.querySelector(".groups");
  section.groups = section.groups || [];
  section.groups.forEach((group) => renderGroup(group, groups, section));

  node.querySelector(".add-group").addEventListener("click", () => {
    section.groups.push({ name: "新分组", items: [{ label: "新价格", value: "0.00" }] });
    render();
  });
  node.querySelector(".remove-section").addEventListener("click", () => {
    page.sections = page.sections.filter((entry) => entry !== section);
    render();
  });
  sectionList.append(node);
}

function renderEditor() {
  const page = getSelectedPage();
  editor.replaceChildren();
  if (!page) {
    editor.innerHTML = `<div class="error">还没有任何时间价格，请先新增时间</div>`;
    return;
  }

  const node = pageTemplate.content.cloneNode(true);
  bindInput(node.querySelector('[data-field="time"]'), page, "time", () => {
    selectedTime = page.time;
    renderTimeTabs();
    renderActiveTimeSelect();
  });
  bindInput(node.querySelector('[data-field="updatedAt"]'), page, "updatedAt");
  bindInput(node.querySelector('[data-field="notice"]'), page, "notice");

  const sectionList = node.querySelector(".section-list");
  page.sections = page.sections || [];
  page.sections.forEach((section) => renderSection(section, sectionList, page));
  node.querySelector(".add-section").addEventListener("click", () => {
    page.sections.push({
      title: "新板块",
      subtitle: "网页入口",
      linkText: "",
      accent: "blue",
      groups: [{ name: "新分组", items: [{ label: "新价格", value: "0.00" }] }],
      copyText: ""
    });
    render();
  });

  editor.append(node);
}

function render() {
  siteTitleInput.value = appData.siteTitle || "";
  renderActiveTimeSelect();
  renderTimeTabs();
  renderEditor();
}

function downloadData() {
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function saveData() {
  appData.siteTitle = siteTitleInput.value;
  appData.activeTime = activeTimeInput.value || selectedTime;
  const json = JSON.stringify(appData, null, 2);

  if (fileHandle?.createWritable) {
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    setStatus("已保存到 data.json。公告页刷新后会同步显示。");
    return;
  }

  downloadData();
  setStatus("浏览器不支持直接写入文件，已下载新的 data.json。请用它替换原来的 data.json。");
}

async function loadFromGithub() {
  const config = getGithubConfig();
  const result = await githubRequest(getGithubApiUrl(config));
  appData = JSON.parse(base64ToUtf8(result.content));
  githubFileSha = result.sha;
  selectedTime = appData.activeTime || appData.pages?.[0]?.time || "";
  render();
  setStatus("已读取 GitHub 上的最新 data.json。");
}

async function saveToGithub() {
  appData.siteTitle = siteTitleInput.value;
  appData.activeTime = activeTimeInput.value || selectedTime;

  const config = getGithubConfig();
  if (!githubFileSha) {
    const latest = await githubRequest(getGithubApiUrl(config));
    githubFileSha = latest.sha;
  }

  const result = await saveGithubContentFile(
    config.path,
    JSON.stringify(appData, null, 2),
    `Update prices ${new Date().toLocaleString("zh-CN")}`,
    githubFileSha
  );

  githubFileSha = result.content.sha;
  const archivedDate = await archiveCurrentPricesToGithub();
  setStatus(`已保存到 GitHub，并归档到 ${archivedDate}。客户网页等待几十秒后刷新即可看到新内容。`);
}

async function openDataFile() {
  if (!window.showOpenFilePicker) {
    setStatus("当前浏览器不支持直接打开文件，请继续使用自动读取或下载保存。");
    return;
  }
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "JSON 文件", accept: { "application/json": [".json"] } }]
  });
  const file = await handle.getFile();
  appData = JSON.parse(await file.text());
  fileHandle = handle;
  selectedTime = appData.activeTime || appData.pages?.[0]?.time || "";
  render();
  setStatus("已打开 data.json。之后点击保存并同步会直接写回这个文件。");
}

function createPage(time) {
  return {
    time,
    updatedAt: time,
    notice: `${time} 价格已更新`,
    sections: []
  };
}

siteTitleInput.addEventListener("input", () => {
  appData.siteTitle = siteTitleInput.value;
});

activeTimeInput.addEventListener("change", () => {
  appData.activeTime = activeTimeInput.value;
});

openFileButton.addEventListener("click", () => {
  openDataFile().catch((error) => setStatus(error.message));
});

saveFileButton.addEventListener("click", () => {
  saveData().catch((error) => setStatus(error.message));
});

loadGithubButton.addEventListener("click", () => {
  loadFromGithub().catch((error) => setStatus(error.message));
});

saveGithubButton.addEventListener("click", () => {
  saveToGithub().catch((error) => setStatus(error.message));
});

addTimeButton.addEventListener("click", () => {
  const time = window.prompt("请输入新时间，例如 18:00");
  if (!time) return;
  appData.pages.push(createPage(time));
  selectedTime = time;
  render();
});

copyTimeButton.addEventListener("click", () => {
  const page = getSelectedPage();
  if (!page) return;
  const time = window.prompt("复制为哪个时间？例如 18:00");
  if (!time) return;
  const nextPage = JSON.parse(JSON.stringify(page));
  nextPage.time = time;
  nextPage.updatedAt = time;
  appData.pages.push(nextPage);
  selectedTime = time;
  render();
});

deleteTimeButton.addEventListener("click", () => {
  if (appData.pages.length <= 1) {
    setStatus("至少需要保留一个时间。");
    return;
  }
  const page = getSelectedPage();
  if (!page || !window.confirm(`确定删除 ${page.time} 吗？`)) return;
  appData.pages = appData.pages.filter((entry) => entry !== page);
  selectedTime = appData.pages[0]?.time || "";
  if (appData.activeTime === page.time) appData.activeTime = selectedTime;
  render();
});

importPricesButton.addEventListener("click", importPastedPrices);

clearImportButton.addEventListener("click", () => {
  pastePricesInput.value = "";
});

loadDefaultData()
  .then((data) => {
    appData = data;
    selectedTime = data.activeTime || data.pages?.[0]?.time || "";
    render();
    setStatus("已读取 data.json。建议先点“打开 data.json”选择文件，之后可以直接保存并同步。");
  })
  .catch((error) => {
    setStatus(error.message);
  });

let currentTaskElement = null;
let currentStickyNote = null;
let syncDebounceTimer = null;

function saveTasks() {
  const tasks = [];

  $("#taskList li").each(function () {
    const id = $(this).data("id");
    const text = $(this).find("span").text();
    const completed = $(this).hasClass("completed");
    const note = $(`#stickyGrid .note[data-id="${id}"]`);
    const noteContent = note.length ? note.find(".note-content").text() : "";

    tasks.push({ id, text, completed, content: noteContent });
  });

  localStorage.setItem("todoTasks", JSON.stringify(tasks));
}

$(document).on("click", "#saveStickyEdit", function () {
  if (!currentStickyNote) return;

  const newTitle = $("#stickyTitleInput").val().trim();
  const newContent = $("#stickyContentInput").val().trim();

  if (!newTitle) return;
  currentStickyNote.find("h3").text(newTitle);

  const id = currentStickyNote.data("id");
  const todo = $(`#taskList li[data-id="${id}"]`);
  todo.find("span").text(newTitle);

  $("#stickyEditorPage").hide();
  currentStickyNote = null;

  saveTasks();
});

function loadTasks() {
  const stored = localStorage.getItem("todoTasks");
  if (!stored) return;

  const tasks = JSON.parse(stored);

  tasks.forEach((task) => {
    if ($(`#taskList li[data-id="${task.id}"]`).length === 0) {
      const todoItem = $(`
<li data-id="${task.id}" class="${task.completed ? "completed" : ""}">
    <div class="circle"></div>
    <span>${task.text}</span>
    <div class="actions">
        <button class="edit-btn"><i class="bi bi-pencil"></i></button>
        <button class="delete-btn"><i class="bi bi-trash3"></i></button>
    </div>
</li>`);
      $("#taskList").append(todoItem);
      createStickyNote(task.text, task.id, todoItem, task.content);
    } else {
      const todoItem = $(`#taskList li[data-id="${task.id}"]`);
      createStickyNote(task.text, task.id, todoItem, task.content);
    }
  });
}

function addTask() {
  const text = $("#noteInput").val().trim();
  if (!text) return;

  const taskId = "task_" + Date.now();

  const todoItem = $(`
<li data-id="${taskId}">
    <div class="circle"></div>
    <span>${text}</span>
    <div class="actions">
        <button class="edit-btn"><i class="bi bi-pencil"></i></button>
        <button class="delete-btn"><i class="bi bi-trash3"></i></button>
    </div>
</li>`);

  $("#taskList").append(todoItem);
  createStickyNote(text, taskId, todoItem);

  $("#noteInput").val("");
  $("#addModal").hide();

  saveTasks();
  scheduleSheetsSync();
}

function createStickyNote(text, taskId, todoElement, content = "") {
  if ($(`#stickyGrid .note[data-id="${taskId}"]`).length > 0) return;

  const now = new Date();
  const snippet = content
    ? content.replace(/\n/g, " ").substring(0, 50)
    : "Note something down...";

  const note = $(`
    <div class="note" data-id="${taskId}">
        <div class="note-title">${text}</div>
        <div class="note-content" style="display:none;">${content}</div>
        <div class="note-snippet">${snippet}${snippet.length >= 50 ? "..." : ""}</div>
        <span class="note-date">${now.toLocaleDateString()} ${now.toLocaleTimeString()}</span>
        <button class="edit-note-btn"><i class="fa fa-pencil"></i></button>
    </div>`);

  note.data("todoElement", todoElement);

  note.find(".edit-note-btn").click(function (event) {
    event.stopPropagation();
    openInlineEditor(note);
  });

  $("#stickyGrid .add-note").before(note);
}

$(document).on("click", ".add-note", function () {
  currentEditingNote = null;

  $("#editorTitle").val("");
  $("#editorContent").val("");

  $("#stickyGrid").hide();
  $("#inlineStickyEditor").show();
});

$("#exportBtn").click(async function () {
  const sheetId = $("#sheetId").val().trim();
  const sheetName = $("#sheetName").val() || "Sheet1";

  if (!sheetId) {
    alert("Enter Sheet ID first");
    return;
  }

  const notes = [];

  $("#stickyGrid .note").each(function () {
    const title = $(this).find(".note-title").text().trim();
    const content = $(this).find(".note-content").text().trim();
    if (!title && !content) return;

    notes.push([title, content, new Date().toLocaleString()]);
  });

  if (notes.length === 0) {
    alert("No sticky notes to export");
    return;
  }

  try {
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:C1`,
      valueInputOption: "RAW",
      resource: { values: [["Title", "Content", "Status", "Exported"]] },
    });

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:C`,
      valueInputOption: "RAW",
      resource: { values: notes },
    });

    alert(`✅ Exported ${notes.length} sticky notes!`);
  } catch (err) {
    console.error(err);
    alert("Sticky notes export failed");
  }
});

let currentEditingNote = null;

function openInlineEditor(note) {
  currentEditingNote = note;

  const titleText = note.find(".note-title").text();
  const contentText = note.find(".note-content").text() || "";

  $("#editorTitle").val(titleText);
  $("#editorContent").val(contentText);

  $("#stickyGrid").hide();
  $("#inlineStickyEditor").show();
}

$("#inlineStickyEditor").hide();
$("#stickyGrid").show();
currentEditingNote = null;

$("#editorSave").click(() => {
  const newTitle = $("#editorTitle").val().trim();
  const newContent = $("#editorContent").val().trim();

  if (!newTitle && !newContent) return;

  if (currentEditingNote) {
    const taskId = currentEditingNote.data("id");

    currentEditingNote.find(".note-title").text(newTitle || "Untitled");
    currentEditingNote.find(".note-content").text(newContent || "");
    const snippet = (newContent || "").replace(/\n/g, " ").substring(0, 50);
    currentEditingNote
      .find(".note-snippet")
      .text(snippet.length >= 50 ? snippet + "..." : snippet);

    const todoItem = $(`#taskList li[data-id="${taskId}"]`);
    if (todoItem.length) {
      todoItem.find("span").text(newTitle || todoItem.find("span").text());
    }
  } else {
    const id = "task_" + Date.now();
    const now = new Date().toLocaleString();

    const todoItem = $(`
<li data-id="${id}">
  <div class="circle"></div>
  <span>${newTitle}</span>
  <div class="actions">
    <button class="edit-btn"><i class="bi bi-pencil"></i></button>
    <button class="delete-btn"><i class="bi bi-trash3"></i></button>
  </div>
</li>`);
    $("#taskList").append(todoItem);

    const snippet = newContent.replace(/\n/g, " ").substring(0, 50);
    const note = $(`
<div class="note" data-id="${id}">
  <div class="note-title">${newTitle}</div>
  <div class="note-content">${newContent}</div>
  <div class="note-snippet">${snippet.length >= 50 ? snippet + "..." : snippet}</div>
  <span class="note-date">${now}</span>
  <button class="edit-note-btn"><i class="fa fa-pencil"></i></button>
</div>`);
    $("#stickyGrid .add-note").before(note);

    note.find(".edit-note-btn").click(function (event) {
      event.stopPropagation();
      openInlineEditor(note);
    });
  }

  saveTasks();
  scheduleSheetsSync();

  $("#inlineStickyEditor").hide();
  $("#stickyGrid").show();
  currentEditingNote = null;
});

$("#editorCancel").click(() => {
  $("#inlineStickyEditor").hide();
  $("#stickyGrid").show();
  currentEditingNote = null;
});

function reloadStickyWall() {
  $("#stickyGrid").html('<div class="add-note">+</div>');

  const stored = localStorage.getItem("todoTasks");

  if (!stored) {
    addPlaceholderNote();
    return;
  }

  const tasks = JSON.parse(stored);

  if (tasks.length === 0) {
    addPlaceholderNote();
    return;
  }

  tasks.forEach((task) => {
    const todoElement = $(`#taskList li[data-id="${task.id}"]`);
    createStickyNote(task.text, task.id, todoElement, task.content || "");
  });
}

function addPlaceholderNote() {
  const placeholderId = "placeholder_" + Date.now();
  const now = new Date();
  const dateText = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  const placeholderNote = $(`
    <div class="note placeholder-note" data-id="${placeholderId}">
      <div class="note-title">Note something down...</div>
      <div class="note-content" style="display:none;"></div>
      <div class="note-snippet">Note something down...</div>
      <span class="note-date">${dateText}</span>
      <button class="edit-note-btn"><i class="fa fa-pencil"></i></button>
    </div>
  `);

  $("#stickyGrid .add-note").before(placeholderNote);

  placeholderNote.find(".edit-note-btn").click(function (event) {
    event.stopPropagation();
    openInlineEditor(placeholderNote);
  });
}

function openEditModal(element) {
  currentTaskElement = element;
  let text = "";
  if (element.is("li")) text = element.find("span").text();
  $("#editInput").val(text);
  $("#editModal").css("display", "flex");
}

$("#saveEdit").click(function () {
  if (!currentTaskElement) return;
  const newText = $("#editInput").val().trim();
  if (!newText) return;

  const id = currentTaskElement.data("id");
  currentTaskElement.find("span").text(newText);
  $(`#stickyGrid .note[data-id="${id}"]`).find(".note-title").text(newText);

  $("#editModal").hide();
  currentTaskElement = null;
  saveTasks();
  scheduleSheetsSync();
});

$("#cancelEdit").click(function () {
  $("#editModal").hide();
  currentTaskElement = null;
});

$(document).on("click", ".edit-btn", function () {
  const li = $(this).closest("li");
  openEditModal(li);
});

$(document).on("click", ".delete-btn", function () {
  const li = $(this).closest("li");
  const id = li.data("id");
  li.remove();
  $(`#stickyGrid .note[data-id="${id}"]`).remove();
  saveTasks();
  scheduleSheetsSync();
});

$(document).on("click", ".circle", function (event) {
  event.stopPropagation();
  $(this).closest("li").toggleClass("completed");
  saveTasks();
  scheduleSheetsSync();
});

$("#addNoteBtn").click(function () {
  $("#addModal").css("display", "flex");
});

$("#cancelAdd").click(function () {
  $("#addModal").css("display", "none");
});

$("#addTaskBtn").click(addTask);
$("#noteInput").keypress(function (event) {
  if (event.which === 13) addTask();
});

$("#searchTask").on("keyup", function () {
  const filter = $(this).val().toLowerCase();
  $("#taskList li").each(function () {
    const taskText = $(this).find("span").text().toLowerCase();
    $(this).toggle(taskText.indexOf(filter) > -1);
  });
});

$("#searchMenu").on("keyup", function () {
  const filter = $(this).val().toLowerCase();
  $("#taskList li").each(function () {
    const taskMenu = $(this).find("span").text().toLowerCase();
    $(this).toggle(taskMenu.indexOf(filter) > -1);
  });
});

const API_KEY = "AIzaSyBa-LkuYa3OY8g4iCBF6uQIKQJYxFsWV5c";
const CLIENT_ID =
  "909891552442-4mmid1ih7qnb45p2jcfnh6h55tk0dlv9.apps.googleusercontent.com";
const DISCOVERY_DOC =
  "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let sheetsConnected = localStorage.getItem("sheetsConnected") === "true";

function initGoogleApis() {
  const script1 = document.createElement("script");
  script1.src = "https://apis.google.com/js/api.js";
  script1.onload = initGapi;
  document.head.appendChild(script1);

  const script2 = document.createElement("script");
  script2.src = "https://accounts.google.com/gsi/client";
  script2.onload = initGis;
  document.head.appendChild(script2);
}

function initGapi() {
  gapi.load("client", async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    console.log("Google API Ready");
  });
}

function initGis() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: "",
  });
  gisInited = true;
  console.log("Google Auth Ready");
}

$("#authButton").click(function () {
  if (!gapiInited || !gisInited) {
    alert("Google API still loading");
    return;
  }

  tokenClient.callback = (resp) => {
    if (resp.error) {
      alert("Auth failed");
      return;
    }
    sheetsConnected = true;
    localStorage.setItem("sheetsConnected", "true");
    alert("Connected to Google Sheets");
  };

  tokenClient.requestAccessToken({ prompt: "consent" });
});

function scheduleSheetsSync() {
  if (!sheetsConnected) return;

  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    pushAllToSheets();
  }, 800);
}

async function pushAllToSheets() {
  const savedId = localStorage.getItem("savedSheetId") || "";
  const sheetId = $("#sheetId").val().trim() || savedId;
  const sheetName = $("#sheetName").val() || "Sheet1";

  if (!sheetId || !sheetsConnected) return;

  if ($("#sheetId").val().trim() === "" && savedId) {
    $("#sheetId").val(savedId);
  }

  const tasks = [];

  $("#taskList li").each(function () {
    const id = $(this).data("id");
    const title = $(this).find("span").text();
    const done = $(this).hasClass("completed") ? "Done" : "Pending";
    const noteContent =
      $(`#stickyGrid .note[data-id="${id}"] .note-content`).text() || "";

    tasks.push([title, noteContent, done, new Date().toLocaleString()]);
  });

  try {
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    if (tasks.length === 0) {
      console.log("All tasks deleted — sheet cleared");
      return;
    }

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:D1`,
      valueInputOption: "RAW",
      resource: { values: [["Task", "Notes", "Status", "Last Updated"]] },
    });

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:D`,
      valueInputOption: "RAW",
      resource: { values: tasks },
    });

    console.log(`Synced ${tasks.length} tasks to Sheets`);
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

$("#importBtn").click(async function () {
  const sheetId = $("#sheetId").val().trim();
  const sheetName = $("#sheetName").val() || "Sheet1";

  if (!sheetId) {
    alert("Enter Sheet ID first");
    return;
  }

  const tasks = [];

  $("#taskList li").each(function () {
    const id = $(this).data("id");
    const title = $(this).find("span").text();
    const done = $(this).hasClass("completed") ? "Done" : "Pending";
    const noteContent =
      $(`#stickyGrid .note[data-id="${id}"] .note-content`).text() || "";

    tasks.push([title, noteContent, done, new Date().toLocaleString()]);
  });

  if (tasks.length === 0) {
    alert("No tasks to export");
    return;
  }

  try {
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:D1`,
      valueInputOption: "RAW",
      resource: { values: [["Task", "Notes", "Status", "Exported"]] },
    });

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:D`,
      valueInputOption: "RAW",
      resource: { values: tasks },
    });

    sheetsConnected = true;
    localStorage.setItem("sheetsConnected", "true");
    localStorage.setItem("savedSheetId", sheetId);
    alert(`✅ Exported ${tasks.length} tasks with notes!`);
  } catch (err) {
    console.error(err);
    alert("Export failed");
  }
});

function openGoogleSheet() {
  const sheetId = $("#sheetId").val().trim();
  if (!sheetId) {
    alert("Enter a Sheet ID first");
    return;
  }
  window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, "_blank");
}

$(document).ready(function () {
  loadTasks();
  initGoogleApis();

  const savedSheetId = localStorage.getItem("savedSheetId");
  if (savedSheetId) {
    $("#sheetId").val(savedSheetId);
  }
});
let currentTaskElement = null;
let currentStickyNote = null;

/* -------------------------
   SAVE TASKS (LOCAL STORAGE)
------------------------- */

function saveTasks() {
  const tasks = [];

  $("#taskList li").each(function () {
    const id = $(this).data("id");
    const text = $(this).find("span").text();
    const completed = $(this).hasClass("completed");

    // Get the sticky note content if it exists
    const note = $(`#stickyGrid .note[data-id="${id}"]`);
    const noteContent = note.length ? note.find(".note-content").text() : "";

    tasks.push({ id, text, completed, content: noteContent });
  });

  localStorage.setItem("todoTasks", JSON.stringify(tasks));
}

/* -------------------------
   SAVE STICKY EDIT
------------------------- */

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

/* -------------------------
   LOAD TASKS
------------------------- */

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

/* -------------------------
   ADD TASK
------------------------- */

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
}

/* -------------------------
   CREATE STICKY NOTE
------------------------- */

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

// -------------------------
// ADD NEW NOTE BUTTON
// -------------------------

$(document).on("click", ".add-note", function () {
  currentEditingNote = null;

  $("#editorTitle").val("");
  $("#editorContent").val("");

  $("#stickyGrid").hide();
  $("#inlineStickyEditor").show();
});

/* -----------------------------
   EXPORT STICKY NOTES TO GOOGLE SHEETS
----------------------------- */

$("#exportBtn").click(async function () {
  const sheetId = $("#sheetId").val().trim();
  const sheetName = $("#sheetName").val() || "Sheet1";

  if (!sheetId) {
    alert("Enter Sheet ID first");
    return;
  }

  const notes = [];

  // Collect all notes except the Add button
  $("#stickyGrid .note").each(function () {
    const title = $(this).find(".note-title").text().trim();
    const content = $(this).find(".note-content").text().trim();
    if (!title && !content) return; // skip empty placeholders

    notes.push([title, content, new Date().toLocaleString()]);
  });

  if (notes.length === 0) {
    alert("No sticky notes to export");
    return;
  }

  try {
    // Clear existing data
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    // Add headers
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:C1`,
      valueInputOption: "RAW",
      resource: { values: [["Title", "Content", "Status", "Exported"]] },
    });

    // Append notes
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

/* -------------------------
   INLINE EDITOR
------------------------- */

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

  // Do nothing if both are empty
  if (!newTitle && !newContent) return;

  // If we are editing an existing note
  if (currentEditingNote) {
    const taskId = currentEditingNote.data("id");

    // 1️⃣ Update sticky note
    currentEditingNote.find(".note-title").text(newTitle || "Untitled");
    currentEditingNote.find(".note-content").text(newContent || "");
    const snippet = (newContent || "").replace(/\n/g, " ").substring(0, 50);
    currentEditingNote
      .find(".note-snippet")
      .text(snippet.length >= 50 ? snippet + "..." : snippet);

    // 2️⃣ Update To-Do title
    const todoItem = $(`#taskList li[data-id="${taskId}"]`);
    if (todoItem.length) {
      todoItem.find("span").text(newTitle || todoItem.find("span").text());
    }
  } else {
    // If there’s no current note, create a new one (placeholder scenario)
    const id = "task_" + Date.now();
    const now = new Date().toLocaleString();

    // Create To-Do
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

    // Create Sticky Note
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

    // Bind edit button
    note.find(".edit-note-btn").click(function (event) {
      event.stopPropagation();
      openInlineEditor(note);
    });
  }

  // ✅ Always save tasks and return to sticky wall
  saveTasks();
  $("#inlineStickyEditor").hide();
  $("#stickyGrid").show();
  currentEditingNote = null;
});

// Inline Sticky Editor Cancel
$("#editorCancel").click(() => {
  $("#inlineStickyEditor").hide(); // hide editor
  $("#stickyGrid").show(); // show sticky wall again
  currentEditingNote = null; // reset current note
});

/* -------------------------
   RESTORE STICKY WALL
------------------------- */

function reloadStickyWall() {
  // Clear sticky grid but keep the Add Note button
  $("#stickyGrid").html('<div class="add-note">+</div>');

  const stored = localStorage.getItem("todoTasks");

  if (!stored) {
    // No saved tasks → show a placeholder note
    addPlaceholderNote();
    return;
  }

  const tasks = JSON.parse(stored);

  if (tasks.length === 0) {
    // No tasks saved → same placeholder
    addPlaceholderNote();
    return;
  }

  // Load saved tasks with proper content
  tasks.forEach((task) => {
    const todoElement = $(`#taskList li[data-id="${task.id}"]`);
    createStickyNote(task.text, task.id, todoElement, task.content || "");
  });
}

/* -------------------------
   Placeholder Note
------------------------- */
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

  // Enable inline editing for placeholder
  placeholderNote.find(".edit-note-btn").click(function (event) {
    event.stopPropagation();
    openInlineEditor(placeholderNote);
  });
}

/* -------------------------
   TODO EDIT MODAL
------------------------- */

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
});

$("#cancelEdit").click(function () {
  $("#editModal").hide();
  currentTaskElement = null;
});

$(document).on("click", ".edit-btn", function () {
  const li = $(this).closest("li");
  openEditModal(li);
});

/* -------------------------
   DELETE TASK
------------------------- */

$(document).on("click", ".delete-btn", function () {
  const li = $(this).closest("li");
  const id = li.data("id");
  li.remove();
  $(`#stickyGrid .note[data-id="${id}"]`).remove();
  saveTasks();
});

/* -------------------------
   COMPLETE TASK
------------------------- */

$(document).on("click", ".circle", function (event) {
  event.stopPropagation();
  $(this).closest("li").toggleClass("completed");
  saveTasks();
});

/* -------------------------
   ADD MODAL
------------------------- */

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

/* -------------------------
   SEARCH TASK
------------------------- */

$("#searchTask").on("keyup", function () {
  const filter = $(this).val().toLowerCase();
  $("#taskList li").each(function () {
    const taskText = $(this).find("span").text().toLowerCase();
    $(this).toggle(taskText.indexOf(filter) > -1);
  });
});

/* -------------------------
   SEARCH MENU
------------------------- */

$("#searchMenu").on("keyup", function () {
  const filter = $(this).val().toLowerCase();
  $("#taskList li").each(function () {
    const taskMenu = $(this).find("span").text().toLowerCase();
    $(this).toggle(taskMenu.indexOf(filter) > -1);
  });
});

/* -----------------------------
   GOOGLE SHEETS CONFIG
----------------------------- */

const API_KEY = "AIzaSyBa-LkuYa3OY8g4iCBF6uQIKQJYxFsWV5c";
const CLIENT_ID =
  "909891552442-4mmid1ih7qnb45p2jcfnh6h55tk0dlv9.apps.googleusercontent.com";
const DISCOVERY_DOC =
  "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;

/* -----------------------------
   LOAD GOOGLE API
----------------------------- */

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

/* -----------------------------
   GOOGLE AUTH
----------------------------- */

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
    alert("Connected to Google Sheets");
  };

  tokenClient.requestAccessToken({ prompt: "consent" });
});

/* -----------------------------
   IMPORT TODOS TO GOOGLE SHEETS
----------------------------- */

$("#importBtn").click(async function () {
  const sheetId = $("#sheetId").val().trim();
  const sheetName = $("#sheetName").val() || "Sheet1";

  if (!sheetId) {
    alert("Enter Sheet ID first");
    return;
  }

  const tasks = [];

  $("#taskList li").each(function () {
    const id = $(this).data("id"); // task ID
    const title = $(this).find("span").text();
    const done = $(this).hasClass("completed") ? "Done" : "Pending";

    // Get corresponding sticky note content if exists
    const noteContent =
      $(`#stickyGrid .note[data-id="${id}"] .note-content`).text() || "";

    tasks.push([title, noteContent, done, new Date().toLocaleString()]);
  });

  if (tasks.length === 0) {
    alert("No tasks to export");
    return;
  }

  try {
    // Clear previous data
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    // Add headers
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:D1`,
      valueInputOption: "RAW",
      resource: { values: [["Task", "Notes", "Status", "Exported"]] },
    });

    // Append tasks + sticky notes
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:D`,
      valueInputOption: "RAW",
      resource: { values: tasks },
    });

    alert(`✅ Exported ${tasks.length} tasks with notes!`);
  } catch (err) {
    console.error(err);
    alert("Export failed");
  }
});

/* -----------------------------
   INIT
----------------------------- */

$(document).ready(function () {
  loadTasks();
  initGoogleApis();
});

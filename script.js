// Configuration - UPDATE THESE!
const API_KEY = 'AIzaSyBa-LkuYa3OY8g4iCBF6uQIKQJYxFsWV5c';
const CLIENT_ID = '909891552442-4mmid1ih7qnb45p2jcfnh6h55tk0dlv9.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let todos = [];

// DOM Elements
const authButton = document.getElementById('authButton');
const authText = document.getElementById('authText');
const authSpinner = document.getElementById('authSpinner');
const todoSection = document.getElementById('todoSection');
const sheetIdInput = document.getElementById('sheetId');
const sheetNameInput = document.getElementById('sheetName');
const todoInput = document.getElementById('todoInput');
const addTodoBtn = document.getElementById('addTodo');
const todoList = document.getElementById('todoList');
const importBtn = document.getElementById('importBtn');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');

// Status helper
function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
}

// Load Google APIs with proper error handling
function initGoogleApis() {
    // Load gapi first
    const script1 = document.createElement('script');
    script1.src = 'https://apis.google.com/js/api.js';
    script1.onload = initGapi;
    script1.onerror = () => showStatus('Failed to load Google API', 'error');
    document.head.appendChild(script1);

    // Load Google Identity Services
    const script2 = document.createElement('script');
    script2.src = 'https://accounts.google.com/gsi/client';
    script2.onload = initGis;
    script2.onerror = () => showStatus('Failed to load Google login', 'error');
    document.head.appendChild(script2);
}

// Initialize GAPI
function initGapi() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            console.log('✅ GAPI initialized');
            maybeEnableButtons();
        } catch (error) {
            console.error('GAPI init error:', error);
            showStatus('Google Sheets API error. Check API_KEY.', 'error');
        }
    });
}

// Initialize Google Identity Services
function initGis() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '',
        });
        gisInited = true;
        console.log('✅ Google Identity initialized');
        maybeEnableButtons();
    } catch (error) {
        console.error('GIS init error:', error);
        showStatus('Google login error. Check CLIENT_ID.', 'error');
    }
}

// Auth button
authButton.addEventListener('click', handleAuth);

async function handleAuth() {
    if (gapiInited && gisInited) {
        if (gapi.client.getToken()) {
            onAuthSuccess();
            return;
        }
        
        authText.textContent = 'Connecting...';
        authSpinner.classList.remove('hidden');
        
        tokenClient.callback = (resp) => {
            if (resp.error) {
                showStatus('Auth failed: ' + resp.error, 'error');
                authSpinner.classList.add('hidden');
                authText.textContent = 'Connect Google Sheets';
                return;
            }
            authSpinner.classList.add('hidden');
            authText.textContent = '✅ Connected';
            onAuthSuccess();
        };
        
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        showStatus('Google APIs still loading...', 'info');
    }
}

function onAuthSuccess() {
    todoSection.classList.remove('hidden');
    authButton.disabled = true;
    authButton.innerHTML = '✅ Connected to Google Sheets';
    maybeEnableButtons();
}

function maybeEnableButtons() {
    const hasAuth = gapiInited && gisInited && gapi.client.getToken();
    importBtn.disabled = !(todos.length > 0 && hasAuth);
}

// Todo management
addTodoBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});

function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    
    todos.push({
        id: Date.now(),
        text,
        completed: false
    });
    
    todoInput.value = '';
    renderTodos();
    maybeEnableButtons();
}

function renderTodos() {
    todoList.innerHTML = '';
    todos.forEach(todo => {
        const div = document.createElement('div');
        div.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                    onchange="window.toggleTodo(${todo.id})">
            <span>${escapeHtml(todo.text)}</span>
            <button onclick="window.deleteTodo(${todo.id})" title="Delete">×</button>
        `;
        todoList.appendChild(div);
    });
}

window.toggleTodo = function(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) todo.completed = !todo.completed;
    renderTodos();
};

window.deleteTodo = function(id) {
    todos = todos.filter(t => t.id !== id);
    renderTodos();
    maybeEnableButtons();
};

clearBtn.addEventListener('click', () => {
    todos = [];
    renderTodos();
    maybeEnableButtons();
});

// Import to Sheets
importBtn.addEventListener('click', importToSheets);

async function importToSheets() {
    const sheetId = sheetIdInput.value.trim();
    if (!sheetId) {
        showStatus('Enter Sheet ID first!', 'error');
        return;
    }
    
    if (todos.length === 0) {
        showStatus('Add some todos first!', 'error');
        return;
    }

    importBtn.disabled = true;
    const spinner = importBtn.querySelector('.spinner') || document.createElement('div');
    spinner.className = 'spinner';
    importBtn.appendChild(spinner);
    spinner.classList.remove('hidden');
    importBtn.querySelector('span').textContent = 'Importing...';

    try {
        const sheetName = sheetNameInput.value.trim() || 'Sheet1';
        const values = todos.map(todo => [
            todo.text,
            todo.completed ? '✅' : '⭕',
            new Date().toLocaleString()
        ]);

        // Clear and add data
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:Z`,
        });

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1:C1`,
            valueInputOption: 'RAW',
            resource: { values: [['Task', 'Status', 'Imported']] }
        });

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:C`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
        });

        showStatus(`✅ Imported ${todos.length} todos!`, 'success');
    } catch (error) {
        console.error('Import error:', error);
        showStatus(`Error: ${error.result?.error?.message || error.message}`, 'error');
    } finally {
        importBtn.disabled = false;
        spinner.classList.add('hidden');
        importBtn.querySelector('span').textContent = 'Import to Google Sheets';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// START APP
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 App starting...');
    console.log('API_KEY:', API_KEY.substring(0, 20) + '...');
    console.log('CLIENT_ID:', CLIENT_ID.substring(0, 20) + '...');
    initGoogleApis();
});
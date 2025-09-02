// ==============================
// Configuration
// ==============================
const API_BASE = "https://kanban-backend-2vbh.onrender.com";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBrVS_wy5r0If2By4FZSQQq5furnciiJGY",
  authDomain: "kanbanboardapp-62dbe.firebaseapp.com",
  projectId: "kanbanboardapp-62dbe",
  storageBucket: "kanbanboardapp-62dbe.firebasestorage.app",
  messagingSenderId: "489531772022",
  appId: "1:489531772022:web:681402f74a7dbc0917a357",
  measurementId: "G-0W2YCG3NQJ"
};

// ==============================
// State
// ==============================
const state = {
  tasks: [],
  currentUser: null,
  tokenRefreshAttempted: false,
  isServerWarmingUp: false
};

// ==============================
// DOM
// ==============================
const elements = {
  authSection: document.getElementById("auth-section"),
  boardSection: document.getElementById("board-section"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  googleSignIn: document.getElementById("google-signin"),
  logoutBtn: document.getElementById("logout-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  addTaskBtn: document.getElementById("add-task-btn"),
  taskModal: document.getElementById("task-modal"),
  taskForm: document.getElementById("task-form"),
  modalClose: document.getElementById("modal-close"),
  taskDelete: document.getElementById("task-delete"),
  corsWarning: document.getElementById("cors-warning"),
  warmupMessage: document.getElementById("warmup-message"),
  loadingOverlay: document.getElementById("loading-overlay"),
  authTabs: document.querySelectorAll(".auth-tab"),
  toastContainer: document.getElementById("toast-container"), // <-- FIX: was missing
  taskLists: {
    1: document.querySelector("#lane-1 .task-list"),
    2: document.querySelector("#lane-2 .task-list"),
    3: document.querySelector("#lane-3 .task-list")
  },
  addTaskForms: document.querySelectorAll(".add-task-form")
};

// ==============================
// Firebase init (compat SDK loaded in index.html)
// ==============================
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();

// ==============================
// Auth state observer
// ==============================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.currentUser = user;
    try {
      await loadTasks();
      showBoard();
    } catch (err) {
      showToast("Failed to load tasks. Please try again.", "error");
      console.error(err);
    }
  } else {
    state.currentUser = null;
    showAuth();
  }
});

// ==============================
// Auth listeners
// ==============================
function setupAuthListeners() {
  // Login
  elements.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    try {
      showLoading(true);
      await auth.signInWithEmailAndPassword(email, password);
      document.getElementById("login-error").textContent = "";
    } catch (error) {
      document.getElementById("login-error").textContent = error.message;
      showToast(error.message, "error");
    } finally {
      showLoading(false);
    }
  });

  // Register
  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    if (password !== confirm) {
      document.getElementById("register-error").textContent = "Passwords do not match";
      return;
    }
    try {
      showLoading(true);
      await auth.createUserWithEmailAndPassword(email, password);
      document.getElementById("register-error").textContent = "";
    } catch (error) {
      document.getElementById("register-error").textContent = error.message;
      showToast(error.message, "error");
    } finally {
      showLoading(false);
    }
  });

  // Google Sign-In
  elements.googleSignIn.addEventListener("click", async () => {
    try {
      showLoading(true);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithPopup(provider);
      // If popup blocked or domain not authorized, Firebase throws → caught below → toast.
    } catch (error) {
      showToast(error.message || "Google sign-in failed", "error");
      console.error(error);
    } finally {
      showLoading(false);
    }
  });

  // Logout
  elements.logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      showToast("Signed out.", "success");
    } catch (error) {
      showToast(error.message || "Failed to sign out", "error");
    }
  });

  // Auth tabs
  elements.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      elements.authTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
      document.getElementById(`${tabName}-form`).classList.add("active");
    });
  });
}

// ==============================
// API Fetch helper
// ==============================
async function apiFetch(path, options = {}) {
  // warmup banner if slow
  if (!state.isServerWarmingUp && !options.isRetry) {
    const warmupTimer = setTimeout(() => {
      state.isServerWarmingUp = true;
      elements.warmupMessage.classList.remove("hidden");
    }, 1500);
    options.onComplete = () => {
      clearTimeout(warmupTimer);
      state.isServerWarmingUp = false;
      elements.warmupMessage.classList.add("hidden");
    };
  }

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const token = await user.getIdToken();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };

    const { onComplete, isRetry, ...fetchOptions } = options; // don't pass our custom fields to fetch
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers
    });

    if (options.onComplete) options.onComplete();

    if (response.status === 401) {
      const text = await response.text().catch(() => "");
      // refresh token ONCE if invalid/expired
      if (text.includes("Invalid Firebase token") && !state.tokenRefreshAttempted) {
        state.tokenRefreshAttempted = true;
        await user.getIdToken(true);
        return apiFetch(path, { ...options, isRetry: true });
      }
      throw new Error(text || "Authentication failed");
    }

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${msg}`);
    }

    state.tokenRefreshAttempted = false;
    return response.status === 204 ? null : response.json();
  } catch (error) {
    if (options.onComplete) options.onComplete();
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      elements.corsWarning.classList.remove("hidden");
    }
    throw error;
  }
}

// ==============================
// Tasks
// ==============================
async function loadTasks() {
  try {
    showLoading(true);
    state.tasks = await apiFetch("/api/Tasks");
    renderBoard();
  } catch (error) {
    if (
      error.message.includes("Missing Firebase token") ||
      error.message.includes("Invalid Firebase token")
    ) {
      showToast("Authentication error. Please log in again.", "error");
      auth.signOut();
    } else {
      showToast(error.message || "Failed to load tasks.", "error");
      console.error(error);
    }
  } finally {
    showLoading(false);
  }
}

function renderBoard() {
  Object.values(elements.taskLists).forEach((list) => (list.innerHTML = ""));

  const tasksByColumn = { 1: [], 2: [], 3: [], other: [] };
  state.tasks.forEach((t) => {
    if ([1, 2, 3].includes(t.columnId)) tasksByColumn[t.columnId].push(t);
    else tasksByColumn.other.push(t);
  });

  for (const [columnId, tasks] of Object.entries(tasksByColumn)) {
    if (columnId === "other") continue;
    const list = elements.taskLists[columnId];
    if (!list) continue;
    if (tasks.length === 0) {
      list.innerHTML = '<p class="no-tasks">No tasks in this column</p>';
      continue;
    }
    list.innerHTML = "";
    tasks.forEach((task) => list.appendChild(createTaskCard(task)));
  }

  if (tasksByColumn.other.length > 0) {
    console.warn("Tasks with unknown column IDs:", tasksByColumn.other);
  }
}

function createTaskCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.setAttribute("data-task-id", task.id);
  card.draggable = true;

  const title = document.createElement("h4");
  title.textContent = task.title;

  const description = document.createElement("p");
  description.textContent = task.description || "No description";

  card.appendChild(title);
  card.appendChild(description);

  if (task.tags) {
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "task-tags";
    task.tags.split(",").forEach((tag) => {
      const t = tag.trim();
      if (!t) return;
      const chip = document.createElement("span");
      chip.className = "task-tag";
      chip.textContent = t;
      tagsContainer.appendChild(chip);
    });
    if (tagsContainer.children.length) card.appendChild(tagsContainer);
  }

  if (task.dueDate) {
    const due = document.createElement("div");
    due.className = "task-meta";
    due.textContent = `Due: ${formatDate(task.dueDate)}`;
    card.appendChild(due);
  }

  card.addEventListener("click", () => openEditModal(task));
  card.addEventListener("dragstart", handleDragStart);
  card.addEventListener("dragend", handleDragEnd);

  return card;
}

function formatDate(s) {
  const d = new Date(s);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ==============================
// Modal + CRUD
// ==============================
function openEditModal(task = null) {
  const isNew = !task;
  const modalTitle = document.getElementById("modal-title");
  const form = document.getElementById("task-form");

  if (isNew) {
    modalTitle.textContent = "Add New Task";
    form.reset();
    document.getElementById("task-id").value = "";
    document.getElementById("task-isDone").checked = false;
    document.getElementById("task-columnId").value = "1";
  } else {
    modalTitle.textContent = "Edit Task";
    document.getElementById("task-id").value = task.id;
    document.getElementById("task-title").value = task.title;
    document.getElementById("task-description").value = task.description || "";
    document.getElementById("task-tags").value = task.tags || "";
    document.getElementById("task-dueDate").value = task.dueDate ? task.dueDate.substring(0, 16) : "";
    document.getElementById("task-isDone").checked = task.isDone;
    document.getElementById("task-columnId").value = task.columnId;
  }

  elements.taskDelete.style.display = isNew ? "none" : "block";
  elements.taskModal.classList.remove("hidden");
}

function closeModal() {
  elements.taskModal.classList.add("hidden");
}

async function createTask(taskData) {
  try {
    const newTask = await apiFetch("/api/Tasks", {
      method: "POST",
      body: JSON.stringify(taskData)
    });
    state.tasks.push(newTask);
    renderBoard();
    showToast("Task created successfully", "success");
    return newTask;
  } catch (error) {
    showToast("Failed to create task: " + (error.message || ""), "error");
    throw error;
  }
}

async function updateTask(taskId, taskData) {
  try {
    await apiFetch(`/api/Tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(taskData)
    });
    const idx = state.tasks.findIndex((t) => t.id === Number(taskId));
    if (idx !== -1) state.tasks[idx] = { ...state.tasks[idx], ...taskData };
    renderBoard();
    showToast("Task updated successfully", "success");
  } catch (error) {
    showToast("Failed to update task: " + (error.message || ""), "error");
    throw error;
  }
}

async function deleteTask(taskId) {
  if (!confirm("Are you sure you want to delete this task?")) return;

  const original = [...state.tasks];
  try {
    state.tasks = state.tasks.filter((t) => t.id !== Number(taskId));
    renderBoard();
    await apiFetch(`/api/Tasks/${taskId}`, { method: "DELETE" });
    showToast("Task deleted successfully", "success");
  } catch (error) {
    state.tasks = original; // rollback
    renderBoard();
    showToast("Failed to delete task: " + (error.message || ""), "error");
    throw error;
  }
}

// ==============================
// Drag & Drop
// ==============================
function handleDragStart(e) {
  e.dataTransfer.setData("text/plain", e.target.getAttribute("data-task-id"));
  e.target.classList.add("dragging");
}
function handleDragEnd(e) {
  e.target.classList.remove("dragging");
}

function setupDragAndDrop() {
  const columns = document.querySelectorAll(".column");
  columns.forEach((column) => {
    column.addEventListener("dragover", (e) => {
      e.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");

      const taskId = e.dataTransfer.getData("text/plain");
      const newColumnId = parseInt(column.id.split("-")[1], 10);

      // FIX: declare outside try so catch can access
      let originalColumnId = null;
      let movedTask = null;

      try {
        movedTask = state.tasks.find((t) => t.id == taskId);
        if (!movedTask) return;
        originalColumnId = movedTask.columnId;

        // optimistic move
        movedTask.columnId = newColumnId;
        renderBoard();

        await updateTask(taskId, {
          title: movedTask.title,
          isDone: movedTask.isDone,
          columnId: newColumnId,
          description: movedTask.description,
          tags: movedTask.tags,
          dueDate: movedTask.dueDate
        });
      } catch (error) {
        // rollback on error
        if (movedTask && originalColumnId != null) {
          movedTask.columnId = originalColumnId;
          renderBoard();
        }
      }
    });
  });
}

// ==============================
// UI helpers
// ==============================
function showAuth() {
  elements.authSection.classList.remove("hidden");
  elements.boardSection.classList.add("hidden");
}
function showBoard() {
  elements.authSection.classList.add("hidden");
  elements.boardSection.classList.remove("hidden");
}
function showLoading(show) {
  elements.loadingOverlay.classList.toggle("hidden", !show);
}
function showToast(message, type = "info") {
  // Guard: if container missing, create it (saves you from silent crashes)
  if (!elements.toastContainer) {
    const c = document.createElement("div");
    c.id = "toast-container";
    c.className = "toast-container";
    document.body.appendChild(c);
    elements.toastContainer = c;
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span><button aria-label="Close">&times;</button>`;
  toast.querySelector("button").onclick = () => toast.remove();
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ==============================
// Init
// ==============================
function init() {
  setupAuthListeners();
  setupDragAndDrop();

  elements.refreshBtn.addEventListener("click", () => loadTasks());
  elements.addTaskBtn.addEventListener("click", () => openEditModal());
  elements.modalClose.addEventListener("click", closeModal);

  elements.taskModal.addEventListener("click", (e) => {
    if (e.target === elements.taskModal) closeModal();
  });

  elements.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("task-id").value;
    const taskData = {
      title: document.getElementById("task-title").value,
      description: document.getElementById("task-description").value || null,
      tags: document.getElementById("task-tags").value || null,
      dueDate: document.getElementById("task-dueDate").value
        ? new Date(document.getElementById("task-dueDate").value).toISOString()
        : null,
      isDone: document.getElementById("task-isDone").checked,
      columnId: parseInt(document.getElementById("task-columnId").value, 10)
    };
    try {
      showLoading(true);
      if (taskId) await updateTask(taskId, taskData);
      else await createTask(taskData);
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      showLoading(false);
    }
  });

  elements.taskDelete.addEventListener("click", async () => {
    const taskId = document.getElementById("task-id").value;
    if (!taskId) return;
    try {
      showLoading(true);
      await deleteTask(taskId);
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      showLoading(false);
    }
  });

  // Inline add-task forms
  elements.addTaskForms.forEach((form, idx) => {
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const columnId = idx + 1;
    button.addEventListener("click", async () => {
      const title = input.value.trim();
      if (!title) return;
      try {
        showLoading(true);
        await createTask({
          title,
          columnId,
          description: null,
          tags: null,
          dueDate: null,
          isDone: false
        });
        input.value = "";
      } catch (err) {
        console.error(err);
      } finally {
        showLoading(false);
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        button.click();
      }
    });
  });

  // CORS heads-up if not the whitelisted Render origin
  if (window.location.origin !== "https://kanban-board-xtt1.onrender.com") {
    elements.corsWarning.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", init);

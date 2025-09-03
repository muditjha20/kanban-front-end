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
  currentUser: null,
  tasks: [],
  dragData: null,
  isServerWarmingUp: false,
  tokenRefreshAttempted: false
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
  toastContainer: document.getElementById("toast-container"),
  userEmail: document.getElementById("user-email"),
  userAvatar: document.getElementById("user-avatar"),
  taskLists: {
    1: document.querySelector("#lane-1 .task-list"),
    2: document.querySelector("#lane-2 .task-list"),
    3: document.querySelector("#lane-3 .task-list")
  },
  addTaskForms: document.querySelectorAll(".add-task-form"),
  taskCounts: {
    1: document.querySelector("#lane-1 .task-count"),
    2: document.querySelector("#lane-2 .task-count"),
    3: document.querySelector("#lane-3 .task-count")
  }
};

const userInfoContainer = elements.logoutBtn ? elements.logoutBtn.closest('.user-info') : null;

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
    // Fill header UI
    if (elements.userEmail) elements.userEmail.textContent = user.email || "";
    if (elements.userAvatar) elements.userAvatar.textContent = (user.email || "U").charAt(0).toUpperCase();
    // Show user-info & logout
    if (userInfoContainer) userInfoContainer.classList.remove("hidden");
    if (elements.logoutBtn) elements.logoutBtn.classList.remove("hidden");

    // Show the board immediately so it doesn't look like nothing happened
    showBoard();
    try {
      await loadTasks();
    } catch (err) {
      showToast("You're signed in, but tasks couldn't load yet. Try Refresh.", "warning");
      console.error(err);
    }
  } else {
    state.currentUser = null;
    // Hide user-info & logout
    if (userInfoContainer) userInfoContainer.classList.add("hidden");
    if (elements.logoutBtn) elements.logoutBtn.classList.add("hidden");
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
    const token = user ? await user.getIdToken() : null;

    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (options.onComplete) options.onComplete();

    // handle token expiration once
    if (response.status === 401 && !state.tokenRefreshAttempted && auth.currentUser) {
      state.tokenRefreshAttempted = true;
      await auth.currentUser.getIdToken(true);
      return apiFetch(path, { ...options, isRetry: true });
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
// CRUD
// ==============================
async function loadTasks() {
  showLoading(true);
  try {
    const data = await apiFetch("/api/Tasks");
    state.tasks = Array.isArray(data) ? data : [];
    renderBoard();
  } catch (error) {
    showToast("Failed to load tasks.", "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

async function createTask(task) {
  showLoading(true);
  try {
    const created = await apiFetch("/api/Tasks", {
      method: "POST",
      body: task
    });
    state.tasks.push(created);
    renderBoard();
    showToast("Task created!", "success");
  } catch (error) {
    showToast("Failed to create task.", "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

async function updateTask(id, updates) {
  showLoading(true);
  try {
    const updated = await apiFetch(`/api/Tasks/${id}`, {
      method: "PUT",
      body: updates
    });
    const idx = state.tasks.findIndex((t) => t.id === id);
    if (idx !== -1) state.tasks[idx] = updated;
    renderBoard();
  } catch (error) {
    showToast("Failed to update task.", "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

async function deleteTask(id) {
  showLoading(true);
  try {
    await apiFetch(`/api/Tasks/${id}`, { method: "DELETE" });
    state.tasks = state.tasks.filter((t) => t.id !== id);
    renderBoard();
    showToast("Task deleted.", "success");
  } catch (error) {
    showToast("Failed to delete task.", "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

// ==============================
// Drag & Drop
// ==============================
function setupDragAndDrop() {
  document.querySelectorAll(".task").forEach((card) => {
    card.setAttribute("draggable", "true");
  });

  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".task");
    if (!card) return;
    e.dataTransfer.effectAllowed = "move";
    state.dragData = {
      id: card.dataset.id,
      from: parseInt(card.dataset.status, 10)
    };
    card.classList.add("dragging");
  });

  document.addEventListener("dragend", (e) => {
    const card = e.target.closest(".task");
    if (card) card.classList.remove("dragging");
    state.dragData = null;
  });

  document.querySelectorAll(".task-list").forEach((list) => {
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("drag-over");
    });
    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
    list.addEventListener("drop", async (e) => {
      e.preventDefault();
      list.classList.remove("drag-over");
      const toStatus = parseInt(list.dataset.status, 10);
      if (!state.dragData) return;
      const { id, from } = state.dragData;
      if (from === toStatus) return;

      try {
        await updateTask(id, { columnId: toStatus });
        showToast("Task moved.", "success");
      } catch (error) {
        showToast("Failed to move task.", "error");
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
// Rendering
// ==============================
function renderBoard() {
  // Clear lists
  [1, 2, 3].forEach((id) => {
    elements.taskLists[id].innerHTML = "";
  });

  const byCol = { 1: [], 2: [], 3: [] };
  state.tasks.forEach((t) => {
    const col = byCol[t.columnId] || byCol[1];
    col.push(t);
  });

  [1, 2, 3].forEach((id) => {
    const list = elements.taskLists[id];
    const tasks = byCol[id] || [];
    elements.taskCounts[id].textContent = tasks.length;

    tasks.forEach((t) => {
      const card = document.createElement("div");
      card.className = "task";
      card.dataset.id = t.id;
      card.dataset.status = t.columnId;
      card.innerHTML = `
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span>${t.priority || "Normal"}</span>
          ${t.dueDate ? `<span>${new Date(t.dueDate).toLocaleDateString()}</span>` : ""}
        </div>
      `;
      card.addEventListener("click", () => openEditModal(t));
      card.setAttribute("draggable", "true");
      list.appendChild(card);
    });
  });

  setupDragAndDrop();
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ==============================
// Modal
// ==============================
function openEditModal(task = null) {
  elements.taskModal.classList.remove("hidden");
  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-desc").value = task ? (task.description || "") : "";
  document.getElementById("task-priority").value = task ? (task.priority || "Normal") : "Normal";
  document.getElementById("task-status").value = task ? (task.columnId || 1) : 1;
  document.getElementById("task-due").value = task && task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "";
  elements.taskDelete.classList.toggle("hidden", !task);
}
function closeModal() {
  elements.taskModal.classList.add("hidden");
}

// ==============================
// Add inline "quick add" forms
// ==============================
function wireQuickAddForms() {
  elements.addTaskForms.forEach((form) => {
    const input = form.querySelector("input[type='text']");
    const button = form.querySelector("button[type='submit']");
    const columnId = parseInt(form.dataset.status, 10);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      try {
        showLoading(true);
        await createTask({
          title,
          description: "",
          priority: "Normal",
          columnId,
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
}

// ==============================
// Init
// ==============================
function init() {
  // Ensure signed-out header is hidden by default
  if (userInfoContainer) userInfoContainer.classList.add("hidden");
  if (elements.logoutBtn) elements.logoutBtn.classList.add("hidden");

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
      title: document.getElementById("task-title").value.trim(),
      description: document.getElementById("task-desc").value.trim(),
      priority: document.getElementById("task-priority").value,
      columnId: parseInt(document.getElementById("task-status").value, 10),
      dueDate: document.getElementById("task-due").value ? new Date(document.getElementById("task-due").value).toISOString() : null,
      isDone: false
    };

    if (!taskData.title) {
      showToast("Title is required.", "warning");
      return;
    }

    try {
      if (taskId) {
        await updateTask(taskId, taskData);
        showToast("Task updated!", "success");
      } else {
        await createTask(taskData);
      }
      closeModal();
    } catch (error) {
      showToast("Failed to save task.", "error");
      console.error(error);
    }
  });

  elements.taskDelete.addEventListener("click", async () => {
    const id = document.getElementById("task-id").value;
    if (!id) return;
    try {
      await deleteTask(id);
      closeModal();
    } catch (error) {
      showToast("Failed to delete.", "error");
    }
  });

  wireQuickAddForms();
}

document.addEventListener("DOMContentLoaded", init);

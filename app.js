
// ==============================
// Configuration
// ==============================
const API_BASE = "https://kanban-backend-2vbh.onrender.com";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBrVS_w5r0If2By4FZSQQq5furnciiJGY",
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
  // Lanes
  taskLists: {
    1: document.querySelector("#lane-1 .task-list"),
    2: document.querySelector("#lane-2 .task-list"),
    3: document.querySelector("#lane-3 .task-list"),
  },
  addTaskForms: document.querySelectorAll(".add-task-form"),
  taskCounts: {
    1: document.querySelector("#lane-1 .task-count"),
    2: document.querySelector("#lane-2 .task-count"),
    3: document.querySelector("#lane-3 .task-count"),
  }
};

const userInfoContainer = elements.logoutBtn ? elements.logoutBtn.closest(".user-info") : null;

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
    if (elements.userEmail) elements.userEmail.textContent = user.email || "";
    if (elements.userAvatar) elements.userAvatar.textContent = (user.email || "U").charAt(0).toUpperCase();
    if (userInfoContainer) userInfoContainer.classList.remove("hidden");
    if (elements.logoutBtn) elements.logoutBtn.classList.remove("hidden");

    showBoard();
    try {
      await loadTasks();
    } catch (err) {
      showToast("You're signed in, but tasks couldn't load yet. Try Refresh.", "warning");
      console.error(err);
    }
  } else {
    state.currentUser = null;
    if (userInfoContainer) userInfoContainer.classList.add("hidden");
    if (elements.logoutBtn) elements.logoutBtn.classList.add("hidden");
    showAuth();
  }
});

// ==============================
// UI helpers
// ==============================
function showAuth() {
  elements.authSection.classList.remove("hidden");
  elements.boardSection.classList.add("hidden");
  elements.loadingOverlay.classList.add("hidden"); // ensure no loading overlay pre-login
  elements.warmupMessage?.classList.add("hidden");
}
function showBoard() {
  elements.authSection.classList.add("hidden");
  elements.boardSection.classList.remove("hidden");
}

// Toast
function showToast(message, type = "info") {
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

function showLoading(show) {
  elements.loadingOverlay.classList.toggle("hidden", !show);
}

// ==============================
// Auth wiring
// ==============================
function setupAuthListeners() {
  // Login
  elements.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      showLoading(true);
      await auth.signInWithEmailAndPassword(email, password);
      showToast("Logged in successfully!", "success");
    } catch (error) {
      document.getElementById("login-error").textContent = error.message;
      showToast(error.message || "Login failed", "error");
    } finally {
      showLoading(false);
    }
  });

  // Register
  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm-password").value;
    if (password !== confirm) {
      document.getElementById("register-error").textContent = "Passwords do not match";
      return;
    }
    try {
      showLoading(true);
      await auth.createUserWithEmailAndPassword(email, password);
      showToast("Account created successfully! You are now signed in.", "success");
    } catch (error) {
      document.getElementById("register-error").textContent = error.message;
      showToast(error.message || "Registration failed", "error");
    } finally {
      showLoading(false);
    }
  });

  // Google sign-in
  elements.googleSignIn.addEventListener("click", async () => {
    try {
      showLoading(true);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithPopup(provider);
      showToast("Signed in with Google!", "success");
    } catch (error) {
      showToast("Google sign-in failed", "error");
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
  // show a small warmup message if server is cold
  if (!state.isServerWarmingUp && !options.isRetry) {
    const warmupTimer = setTimeout(() => {
      state.isServerWarmingUp = true;
      elements.warmupMessage?.classList.remove("hidden");
    }, 1500);
    options.onComplete = () => {
      clearTimeout(warmupTimer);
      state.isServerWarmingUp = false;
      elements.warmupMessage?.classList.add("hidden");
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
    if (options.onComplete) options.onComplete?.();
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      elements.corsWarning?.classList.remove("hidden");
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
/** Utility */
// ==============================
function escapeHtml(s) {
  return (s || "").replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
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

      const due = t.dueDate ? new Date(t.dueDate) : null;
      const dueStr = due ? due.toLocaleDateString() + " " + due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

      card.innerHTML = `
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span>${t.priority || "Normal"}</span>
          ${due ? `<span>${escapeHtml(dueStr)}</span>` : ""}
        </div>
        <div class="task-actions">
          <button class="btn-icon edit-btn" title="Edit"><i class="fas fa-pen"></i></button>
          ${t.columnId === 3
            ? `<button class="btn-icon reopen-btn" title="Reopen"><i class="fas fa-rotate-left"></i></button>`
            : `<button class="btn-icon complete-btn" title="Mark as Completed"><i class="fas fa-check"></i></button>`}
          <button class="btn-icon delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      `;

      // actions
      card.querySelector(".edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(t);
      });
      card.querySelector(".delete-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Delete this task?")) await deleteTask(t.id);
      });
      const completeBtn = card.querySelector(".complete-btn");
      if (completeBtn) {
        completeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await updateTask(t.id, { ...t, columnId: 3, isDone: true });
          showToast("Moved to Completed.", "success");
        });
      }
      const reopenBtn = card.querySelector(".reopen-btn");
      if (reopenBtn) {
        reopenBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await updateTask(t.id, { ...t, columnId: 1, isDone: false });
          showToast("Reopened to Active.", "success");
        });
      }

      // make draggable
      card.setAttribute("draggable", "true");
      list.appendChild(card);
    });
  });

  setupDragAndDrop();
}

// ==============================
// Drag & Drop
// ==============================
function setupDragAndDrop() {
  document.querySelectorAll(".task").forEach((card) => {
    card.setAttribute("draggable", "true");
  });

  document.querySelectorAll(".task").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      state.dragData = {
        id: card.dataset.id,
        from: parseInt(card.dataset.status, 10)
      };
      e.dataTransfer.effectAllowed = "move";
    });
  });

  document.querySelectorAll(".task-list").forEach((list) => {
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      list.classList.add("drag-over");
    });
    list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
    list.addEventListener("drop", async (e) => {
      e.preventDefault();
      list.classList.remove("drag-over");
      const newCol = parseInt(list.getAttribute("data-status"), 10);
      const id = state.dragData?.id;
      if (!id || !newCol) return;
      const t = state.tasks.find((x) => String(x.id) === String(id));
      if (!t) return;
      await updateTask(t.id, { ...t, columnId: newCol, isDone: newCol === 3 });
      showToast("Task moved.", "success");
    });
  });
}

// ==============================
// Modal
// ==============================
function openEditModal(task = null) {
  elements.taskModal.classList.remove("hidden");

  // IMPORTANT: align with index.html IDs
  // id/title/descriptions
  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-description").value = task ? (task.description || "") : "";

  // optional fields that exist in HTML
  const tagsEl = document.getElementById("task-tags");
  if (tagsEl) tagsEl.value = task && task.tags ? task.tags.join(", ") : "";

  const dueEl = document.getElementById("task-dueDate");
  if (dueEl) {
    if (task && task.dueDate) {
      // Ensure toLocal datetime format
      const d = new Date(task.dueDate);
      const pad = (n) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      dueEl.value = local;
    } else {
      dueEl.value = "";
    }
  }

  const statusEl = document.getElementById("task-columnId");
  if (statusEl) statusEl.value = task ? (task.columnId || 1) : 1;

  const doneEl = document.getElementById("task-isDone");
  if (doneEl) doneEl.checked = !!(task && (task.columnId === 3 || task.isDone));
}

function closeModal() {
  elements.taskModal.classList.add("hidden");
}

// ==============================
// Init / Wire-up
// ==============================
function wireQuickAddForms() {
  elements.addTaskForms.forEach((form) => {
    const input = form.querySelector("input[type='text']");
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
          isDone: columnId === 3
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
        form.dispatchEvent(new Event("submit"));
      }
    });
  });
}

function init() {
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

  // Task form submit (Save)
  elements.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("task-id").value;
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-description").value.trim();
    const statusEl = document.getElementById("task-columnId");
    const doneEl = document.getElementById("task-isDone");
    const dueEl = document.getElementById("task-dueDate");
    const tagsEl = document.getElementById("task-tags");

    // If checkbox is checked => Completed column
    const isDoneChecked = doneEl ? doneEl.checked : false;
    const selectedColumn = statusEl ? parseInt(statusEl.value, 10) : 1;
    const columnId = isDoneChecked ? 3 : selectedColumn;

    const dueDate = (dueEl && dueEl.value) ? new Date(dueEl.value).toISOString() : null;
    const tags = (tagsEl && tagsEl.value.trim())
      ? tagsEl.value.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    if (!title) {
      showToast("Title is required.", "warning");
      return;
    }

    const base = {
      title,
      description,
      columnId,
      isDone: columnId === 3,
      dueDate
    };
    if (tagsEl) base.tags = tags;

    try {
      if (taskId) {
        await updateTask(taskId, base);
        showToast("Task updated!", "success");
      } else {
        await createTask(base);
      }
      closeModal();
    } catch (error) {
      showToast("Failed to save task.", "error");
      console.error(error);
    }
  });

  // Delete (from modal)
  elements.taskDelete.addEventListener("click", async () => {
    const id = document.getElementById("task-id").value;
    if (!id) return;
    try {
      if (confirm("Delete this task?")) {
        await deleteTask(id);
        closeModal();
      }
    } catch (error) {
      showToast("Failed to delete.", "error");
    }
  });

  wireQuickAddForms();
}

document.addEventListener("DOMContentLoaded", init);

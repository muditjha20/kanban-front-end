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
  measurementId: "G-0W2YCG3NQJ",
};

// ==============================
// State
// ==============================
const state = {
  currentUser: null,
  tasks: [],
  dragData: null,
  isServerWarmingUp: false,
  tokenRefreshAttempted: false,
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
  userInfo: document.getElementById("user-info"),
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
  },
};

// ==============================
// Firebase (compat)
// ==============================
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();

// ==============================
// Auth observer
// ==============================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.currentUser = user;
    elements.userEmail && (elements.userEmail.textContent = user.email || "");
    elements.userAvatar && (elements.userAvatar.textContent = (user.email || "U").charAt(0).toUpperCase());
    elements.userInfo?.classList.remove("hidden");
    elements.logoutBtn?.classList.remove("hidden");
    showBoard();
    try {
      await loadTasks();
    } catch (err) {
      showToast("Signed in, but tasks couldn't load yet. Try Refresh.", "warning");
      console.error(err);
    }
  } else {
    state.currentUser = null;
    elements.userInfo?.classList.add("hidden");
    elements.logoutBtn?.classList.add("hidden");
    showAuth();
  }
});

// ==============================
// UI helpers
// ==============================
function showAuth() {
  elements.authSection.classList.remove("hidden");
  elements.boardSection.classList.add("hidden");
  elements.loadingOverlay.classList.add("hidden"); // no overlay pre-login
  elements.warmupMessage?.classList.add("hidden");
}
function showBoard() {
  elements.authSection.classList.add("hidden");
  elements.boardSection.classList.remove("hidden");
}
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
function escapeHtml(s) {
  return (s || "").replace(/[&<>\"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
const getColIdFromEl = (el) => {
  const col = el.closest(".column");
  if (!col || !col.id) return 1;
  const n = Number(col.id.split("-")[1]); // lane-1 -> 1
  return Number.isFinite(n) ? n : 1;
};

// ==============================
// Auth wiring
// ==============================
function setupAuthListeners() {
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

  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;
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

  // Google sign-in (pure click)
  elements.googleSignIn.addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.signInWithPopup(provider)
      .then(() => showToast("Signed in with Google!", "success"))
      .catch((error) => {
        console.error("Google sign-in error:", error);
        const code = error?.code || "unknown";
        if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
          showToast("Popup blocked/closed. Switching to redirect…", "warning");
          return auth.signInWithRedirect(provider);
        }
        showToast(`${code}: ${error?.message || "Sign-in failed"}`, "error");
      });
  });

  elements.logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      showToast("Signed out.", "success");
    } catch (error) {
      showToast(error.message || "Failed to sign out", "error");
    }
  });

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
// API fetch (flat camelCase bodies, like TS client)
// ==============================
async function apiFetch(path, options = {}) {
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (options.onComplete) options.onComplete();

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
// Helpers
// ==============================
function normalizeTask(t) {
  if (!t) return null;
  const id = t.id ?? t.Id ?? null;
  if (id == null) return null;
  const columnId = Number(t.columnId ?? t.ColumnId ?? (t.isDone ? 3 : 1)) || 1;
  return {
    ...t,
    id: String(id),
    columnId,
    isDone: !!(t.isDone ?? t.IsDone ?? (columnId === 3)),
  };
}
function upsertTaskLocally(id, patch) {
  // Merge into local state even if server returned 204
  const idx = state.tasks.findIndex((x) => String(x?.id) === String(id));
  if (idx === -1) return;
  const merged = normalizeTask({ ...state.tasks[idx], ...patch });
  state.tasks[idx] = merged;
  // prune any accidental nulls
  state.tasks = state.tasks.filter(Boolean);
}

// ==============================
// CRUD (mirror TS shapes & endpoints)
// ==============================
async function loadTasks() {
  showLoading(true);
  try {
    const data = await apiFetch("/api/tasks");
    const tasks = Array.isArray(data) ? data.map(normalizeTask).filter(Boolean) : [];
    state.tasks = tasks;
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
    const body = {
      title: (task.title || "").trim(),
      isDone: !!task.isDone,
      columnId: Number(task.columnId) || 1,
      description: task.description ?? "",
      tags: task.tags ?? "",
      dueDate: task.dueDate ?? null,
    };

    const created = await apiFetch("/api/tasks", {
      method: "POST",
      body,
    });

    const norm = normalizeTask(created);
    if (norm) state.tasks.push(norm);
    renderBoard();
    showToast("Task created!", "success");
    return true;
  } catch (error) {
    try {
      const msg = JSON.parse(error.message.replace(/^HTTP \d+:\s*/, ""));
      console.error("Create validation:", msg);
      if (msg && msg.errors) {
        const fields = Object.keys(msg.errors).join(", ");
        showToast("Create failed: " + fields, "error");
      } else {
        showToast("Failed to create task.", "error");
      }
    } catch {
      showToast("Failed to create task.", "error");
      console.error(error);
    }
    return false;
  } finally {
    showLoading(false);
  }
}

async function updateTask(id, updates) {
  showLoading(true);
  try {
    // TS update sends only these three
    const body = {
      title: (updates.title || "").trim(),
      isDone: !!updates.isDone,
      columnId: Number(updates.columnId) || 1,
    };

    const resp = await apiFetch(`/api/tasks/${id}`, {
      method: "PUT",
      body,
    });

    if (resp === null) {
      // 204 or empty body — merge local with updates
      upsertTaskLocally(id, body);
    } else {
      // replace with server version (normalized)
      const norm = normalizeTask(resp);
      if (norm) {
        const idx = state.tasks.findIndex((t) => String(t?.id) === String(id));
        if (idx !== -1) state.tasks[idx] = norm;
      }
    }

    // cleanup + render
    state.tasks = state.tasks.filter(Boolean);
    renderBoard();
    return true;
  } catch (error) {
    try {
      const msg = JSON.parse(error.message.replace(/^HTTP \d+:\s*/, ""));
      console.error("Update validation:", msg);
      if (msg && msg.errors) {
        const fields = Object.keys(msg.errors).join(", ");
        showToast("Update failed: " + fields, "error");
      } else {
        showToast("Failed to update task.", "error");
      }
    } catch {
      showToast("Failed to update task.", "error");
      console.error(error);
    }
    return false;
  } finally {
    showLoading(false);
  }
}

async function deleteTask(id) {
  showLoading(true);
  try {
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    state.tasks = state.tasks.filter((t) => String(t?.id) !== String(id));
    renderBoard();
    showToast("Task deleted.", "success");
    return true;
  } catch (error) {
    showToast("Failed to delete task.", "error");
    console.error(error);
    return false;
  } finally {
    showLoading(false);
  }
}

// ==============================
// Rendering (MATCH styles.css)
// ==============================
function renderBoard() {
  [1, 2, 3].forEach((id) => (elements.taskLists[id].innerHTML = ""));

  // Filter out any accidental nulls
  const safeTasks = state.tasks.filter(Boolean);

  const byCol = { 1: [], 2: [], 3: [] };
  safeTasks.forEach((t) => {
    const key = Number(t.columnId) || (t.isDone ? 3 : 1);
    (byCol[key] || byCol[1]).push(t);
  });

  [1, 2, 3].forEach((id) => {
    const list = elements.taskLists[id];
    const tasks = byCol[id] || [];
    // restore original count text (just the number)
    elements.taskCounts[id].textContent = tasks.length;

    tasks.forEach((t) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.dataset.id = t.id;
      card.dataset.status = t.columnId;

      // Title (h4)
      const titleEl = document.createElement("h4");
      titleEl.textContent = t.title || "";
      card.appendChild(titleEl);

      // Description (p)
      if (t.description) {
        const desc = document.createElement("p");
        desc.textContent = t.description;
        card.appendChild(desc);
      }

      // Tags
      const tags = Array.isArray(t.tags)
        ? t.tags
        : (typeof t.tags === "string" ? t.tags.split(",") : []).map(s => s.trim()).filter(Boolean);
      if (tags.length) {
        const tagsWrap = document.createElement("div");
        tagsWrap.className = "task-tags";
        tags.forEach(tag => {
          const span = document.createElement("span");
          span.className = "task-tag";
          span.textContent = tag;
          tagsWrap.appendChild(span);
        });
        card.appendChild(tagsWrap);
      }

      // Meta (due date)
      if (t.dueDate) {
        const due = new Date(t.dueDate);
        const meta = document.createElement("div");
        meta.className = "task-meta";
        meta.innerHTML = `<i class="fas fa-calendar-alt"></i> ${escapeHtml(
          `${due.toLocaleDateString()} ${due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        )}`;
        card.appendChild(meta);
      }

      // Click to edit
      card.addEventListener("click", () => openEditModal(t));

      // Draggable
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
  document.querySelectorAll(".task-card").forEach((card) => {
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
      state.dragData = { id: card.dataset.id, from: Number(card.dataset.status) || 1 };
    });
  });

  document.addEventListener("dragend", (e) => {
    const card = e.target.closest?.(".task-card");
    if (card) card.classList.remove("dragging");
    state.dragData = null;
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

      const newCol = getColIdFromEl(list);
      const id = state.dragData?.id;
      if (!id || !newCol) return;

      const t = state.tasks.find((x) => String(x?.id) === String(id));
      if (!t) return;

      const ok = await updateTask(t.id, { ...t, columnId: newCol, isDone: newCol === 3 });
      if (ok) {
        showToast("Task moved.", "success");
      } // updateTask already shows errors if not ok
    });
  });
}

// ==============================
// Modal
// ==============================
function openEditModal(task = null) {
  elements.taskModal.classList.remove("hidden");

  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-description").value = task ? (task.description || "") : "";

  const tagsEl = document.getElementById("task-tags");
  if (tagsEl) tagsEl.value = task && task.tags
    ? (Array.isArray(task.tags) ? task.tags.join(", ") : task.tags)
    : "";

  const dueEl = document.getElementById("task-dueDate");
  if (dueEl) {
    if (task && task.dueDate) {
      const d = new Date(task.dueDate);
      const pad = (n) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      dueEl.value = local;
    } else {
      dueEl.value = "";
    }
  }

  const statusEl = document.getElementById("task-columnId");
  if (statusEl) statusEl.value = task ? (Number(task.columnId) || 1) : 1;

  const doneEl = document.getElementById("task-isDone");
  if (doneEl) doneEl.checked = !!(task && (Number(task.columnId) === 3 || task.isDone));
}

function closeModal() {
  elements.taskModal.classList.add("hidden");
}

// ==============================
// Init / Wiring
// ==============================
function wireQuickAddForms() {
  elements.addTaskForms.forEach((form) => {
    // fall back to any text input if specific class not present
    const input = form.querySelector(".task-title-input") || form.querySelector("input[type='text']");
    const btn = form.querySelector("button");
    const columnId = getColIdFromEl(form);

    const submitNew = async () => {
      const title = (input.value || "").trim();
      if (!title) return;
      try {
        showLoading(true);
        const ok = await createTask({
          title,
          description: "",
          tags: "",
          columnId,
          dueDate: null,
          isDone: columnId === 3,
        });
        if (ok) input.value = "";
      } catch (err) {
        console.error(err);
      } finally {
        showLoading(false);
      }
    };

    btn?.addEventListener("click", (e) => { e.preventDefault(); submitNew(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitNew(); }
    });
  });
}

function init() {
  elements.userInfo?.classList.add("hidden");
  elements.logoutBtn?.classList.add("hidden");

  setupAuthListeners();

  elements.refreshBtn.addEventListener("click", () => loadTasks());
  elements.addTaskBtn.addEventListener("click", () => openEditModal());
  elements.modalClose.addEventListener("click", closeModal);
  elements.taskModal.addEventListener("click", (e) => {
    if (e.target === elements.taskModal) closeModal();
  });

  // Modal save (mirror TS payload)
  elements.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("task-id").value;
    const title = (document.getElementById("task-title").value || "").trim();
    const description = (document.getElementById("task-description").value || "").trim();
    const statusEl = document.getElementById("task-columnId");
    const doneEl = document.getElementById("task-isDone");
    const dueEl = document.getElementById("task-dueDate");

    if (!title) {
      showToast("Title is required.", "warning");
      return;
    }

    const selectedColumn = statusEl ? Number(statusEl.value) : 1;
    const isDoneChecked = doneEl ? !!doneEl.checked : false;
    const columnId = isDoneChecked ? 3 : selectedColumn;
    const dueDate = (dueEl && dueEl.value) ? new Date(dueEl.value).toISOString() : null;

    const payload = {
      title,
      isDone: columnId === 3,
      columnId,
      description,
      tags: document.getElementById("task-tags")?.value || "",
      dueDate,
    };

    try {
      if (taskId) {
        const ok = await updateTask(taskId, payload);
        if (ok) showToast("Task updated!", "success");
      } else {
        const ok = await createTask(payload);
        if (ok) showToast("Task created!", "success");
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
      if (confirm("Delete this task?")) {
        await deleteTask(id);
        closeModal();
      }
    } catch (error) {
      showToast("Failed to delete.", "error");
    }
  });

  wireQuickAddForms();
  // initial DnD bind happens after first render
  loadTasks();
}

document.addEventListener("DOMContentLoaded", init);

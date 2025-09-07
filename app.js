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
  isServerWarmingUp: false,
  tokenRefreshAttempted: false,
  lastDrag: null, // for optimistic DnD revert
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
// Firebase (compat SDK)
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
    elements.userAvatar &&
      (elements.userAvatar.textContent = (user.email || "U").charAt(0).toUpperCase());
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
  elements.loadingOverlay.classList.add("hidden");
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
  setTimeout(() => toast.remove(), 4000);
}
function showLoading(show) {
  elements.loadingOverlay.classList.toggle("hidden", !show);
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>\"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function getColIdFromEl(el) {
  const col = el.closest(".column");
  if (!col || !col.id) return 1;
  const n = Number(col.id.split("-")[1]); // lane-1 -> 1
  return Number.isFinite(n) ? n : 1;
}

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
    auth
      .signInWithPopup(provider)
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
// API fetch (tolerates empty 2xx bodies)
// ==============================
async function apiFetch(path, options = {}) {
  // warmup hint for Render cold start
  if (!state.isServerWarmingUp && !options.isRetry) {
    const warm = setTimeout(() => {
      state.isServerWarmingUp = true;
      elements.warmupMessage?.classList.remove("hidden");
    }, 1500);
    options.onComplete = () => {
      clearTimeout(warm);
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

    // allow empty body successes
    const text = await response.text();
    if (!text || !text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (error) {
    if (options.onComplete) options.onComplete?.();
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      elements.corsWarning?.classList.remove("hidden");
    }
    throw error;
  }
}

// ==============================
// Client-side Task Meta (persisted locally)
// ==============================
const META_KEY = "task_meta_v1";
function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); }
  catch { return {}; }
}
function saveMeta(id, meta) {
  const all = loadMeta();
  const next = { ...(all[String(id)] || {}), ...(meta || {}) };
  // strip empty/null so we don't store junk
  Object.keys(next).forEach((k) => { if (next[k] === "" || next[k] == null) delete next[k]; });
  all[String(id)] = next;
  localStorage.setItem(META_KEY, JSON.stringify(all));
}
function deleteMeta(id) {
  const all = loadMeta();
  if (all[String(id)]) {
    delete all[String(id)];
    localStorage.setItem(META_KEY, JSON.stringify(all));
  }
}
function applyMeta(task) {
  const m = loadMeta()[String(task.id)];
  return m ? { ...task, ...m } : task;
}
function mergeMetaIntoTasks(tasks) {
  const all = loadMeta();
  return tasks.map((t) => (all[String(t.id)] ? { ...t, ...all[String(t.id)] } : t));
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
function replaceTask(id, newTaskLike) {
  const idx = state.tasks.findIndex((x) => String(x?.id) === String(id));
  if (idx !== -1) {
    const merged = normalizeTask({ ...state.tasks[idx], ...newTaskLike });
    if (merged) state.tasks[idx] = applyMeta(merged);
  }
  state.tasks = state.tasks.filter(Boolean);
}

// ==============================
// CRUD
// ==============================
async function loadTasks() {
  showLoading(true); // keep overlay ONLY for full loads/refresh
  try {
    const data = await apiFetch("/api/tasks");
    const tasks = Array.isArray(data) ? data.map(normalizeTask).filter(Boolean) : [];
    state.tasks = mergeMetaIntoTasks(tasks);
    renderBoard();
  } catch (error) {
    showToast("Failed to load tasks.", "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

// refresh without overlay (used after empty POST responses)
async function refreshTasksNoOverlay() {
  try {
    const data = await apiFetch("/api/tasks");
    const tasks = Array.isArray(data) ? data.map(normalizeTask).filter(Boolean) : [];
    state.tasks = mergeMetaIntoTasks(tasks);
    renderBoard();
  } catch (error) {
    console.error("Background refresh failed:", error);
  }
}

async function createTask(task) {
  try {
    const body = {
      title: (task.title || "").trim(),
      isDone: !!task.isDone,
      columnId: Number(task.columnId) || 1,
      description: task.description ?? "",
      tags: task.tags ?? "",
      dueDate: task.dueDate ?? null,
    };

    const created = await apiFetch("/api/tasks", { method: "POST", body });

    if (created) {
      const norm = normalizeTask(created);
      if (norm) {
        // persist client-only fields
        saveMeta(norm.id, { description: body.description, tags: body.tags, dueDate: body.dueDate });
        state.tasks.push(applyMeta(norm));
      }
    } else {
      // backend returned empty; soft refresh (no overlay)
      await refreshTasksNoOverlay();
    }
    renderBoard();
    showToast("Task created!", "success");
    return true;
  } catch (error) {
    try {
      const msg = JSON.parse(error.message.replace(/^HTTP \d+:\s*/, ""));
      if (msg && msg.errors) showToast("Create failed: " + Object.keys(msg.errors).join(", "), "error");
      else showToast("Failed to create task.", "error");
    } catch { showToast("Failed to create task.", "error"); }
    console.error(error);
    return false;
  }
}

async function updateTask(id, updates) {
  try {
    // server only needs these; client meta saved separately
    const body = {
      title: (updates.title || "").trim(),
      isDone: !!updates.isDone,
      columnId: Number(updates.columnId) || 1,
    };

    const resp = await apiFetch(`/api/tasks/${id}`, { method: "PUT", body });

    // save client-only fields regardless of server behavior
    const metaPatch = {};
    if ("description" in updates) metaPatch.description = updates.description ?? "";
    if ("tags" in updates)        metaPatch.tags = updates.tags ?? "";
    if ("dueDate" in updates)     metaPatch.dueDate = updates.dueDate ?? null;
    if (Object.keys(metaPatch).length) saveMeta(id, metaPatch);

    if (resp) {
      const norm = normalizeTask(resp);
      if (norm) replaceTask(id, norm);
    } else {
      // empty success → merge locally
      replaceTask(id, { id, ...body, ...metaPatch });
    }

    renderBoard();
    return true;
  } catch (error) {
    try {
      const msg = JSON.parse(error.message.replace(/^HTTP \d+:\s*/, ""));
      if (msg && msg.errors) showToast("Update failed: " + Object.keys(msg.errors).join(", "), "error");
      else showToast("Failed to update task.", "error");
    } catch { showToast("Failed to update task.", "error"); }
    console.error(error);
    return false;
  }
}

async function deleteTask(id) {
  try {
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    deleteMeta(id);
    state.tasks = state.tasks.filter((t) => String(t?.id) !== String(id));
    renderBoard();
    showToast("Task deleted.", "success");
    return true;
  } catch (error) {
    showToast("Failed to delete task.", "error");
    console.error(error);
    return false;
  }
}

// ==============================
// Rendering (MATCH styles.css)
// ==============================
function renderBoard() {
  [1, 2, 3].forEach((id) => (elements.taskLists[id].innerHTML = ""));

  const safeTasks = (Array.isArray(state.tasks) ? state.tasks : []).filter(Boolean);

  const byCol = { 1: [], 2: [], 3: [] };
  safeTasks.forEach((t) => {
    const key = Number(t.columnId) || (t.isDone ? 3 : 1);
    (byCol[key] || byCol[1]).push(t);
  });

  [1, 2, 3].forEach((id) => {
    const list = elements.taskLists[id];
    const tasks = byCol[id] || [];
    elements.taskCounts[id].textContent = tasks.length;

    tasks.forEach((t) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.dataset.id = t.id;
      card.dataset.status = t.columnId;

      const titleEl = document.createElement("h4");
      titleEl.textContent = t.title || "";
      card.appendChild(titleEl);

      if (t.description) {
        const desc = document.createElement("p");
        desc.textContent = t.description;
        card.appendChild(desc);
      }

      const tags = Array.isArray(t.tags)
        ? t.tags
        : (typeof t.tags === "string" ? t.tags.split(",") : [])
            .map((s) => s.trim())
            .filter(Boolean);
      if (tags.length) {
        const tagsWrap = document.createElement("div");
        tagsWrap.className = "task-tags";
        tags.forEach((tag) => {
          const span = document.createElement("span");
          span.className = "task-tag";
          span.textContent = tag;
          tagsWrap.appendChild(span);
        });
        card.appendChild(tagsWrap);
      }

      if (t.dueDate) {
        const due = new Date(t.dueDate);
        const meta = document.createElement("div");
        meta.className = "task-meta";
        meta.innerHTML = `<i class="fas fa-calendar-alt"></i> ${escapeHtml(
          `${due.toLocaleDateString()} ${due.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        )}`;
        card.appendChild(meta);
      }

      card.addEventListener("click", () => openEditModal(t));

      card.setAttribute("draggable", "true");
      list.appendChild(card);
    });
  });

  setupDragAndDrop();
}

// ==============================
// Drag & Drop (optimistic with revert; no overlay)
// ==============================
function setupDragAndDrop() {
  document.querySelectorAll(".task-card").forEach((card) => {
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
      state.lastDrag = { id: card.dataset.id, from: Number(card.dataset.status) || 1 };
    });
  });

  document.addEventListener("dragend", (e) => {
    const card = e.target.closest?.(".task-card");
    if (card) card.classList.remove("dragging");
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

      const id = state.lastDrag?.id;
      const from = state.lastDrag?.from;
      const to = getColIdFromEl(list);
      if (!id || !to || from === undefined) return;

      const task = state.tasks.find((x) => String(x?.id) === String(id));
      if (!task) return;

      // optimistic local move
      const prev = { columnId: task.columnId, isDone: task.isDone };
      replaceTask(id, { columnId: to, isDone: to === 3 });
      renderBoard();

      // server call
      const ok = await updateTask(id, {
        title: task.title,
        columnId: to,
        isDone: to === 3,
      });

      if (ok) {
        showToast("Task moved.", "success");
      } else {
        // revert on failure
        replaceTask(id, prev);
        renderBoard();
      }
      state.lastDrag = null;
    });
  });
}

// ==============================
// Modal
// ==============================
function openEditModal(task = null) {
  elements.taskModal.classList.remove("hidden");

  const meta = task ? loadMeta()[String(task.id)] || {} : {};

  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-description").value =
    meta.description ?? task?.description ?? "";

  const tagsEl = document.getElementById("task-tags");
  if (tagsEl) tagsEl.value = meta.tags ?? task?.tags ?? "";

  const dueEl = document.getElementById("task-dueDate");
  if (dueEl) {
    const src = meta.dueDate ?? task?.dueDate ?? null;
    if (src) {
      const d = new Date(src);
      const pad = (n) => String(n).padStart(2, "0");
      dueEl.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    const input =
      form.querySelector(".task-title-input") || form.querySelector("input[type='text']");
    const btn = form.querySelector("button");
    const columnId = getColIdFromEl(form);

    const submitNew = async () => {
      const title = (input.value || "").trim();
      if (!title) return;
      const ok = await createTask({
        title,
        description: "",
        tags: "",
        columnId,
        dueDate: null,
        isDone: columnId === 3,
      }).catch(console.error);
      if (ok) input.value = "";
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

  // Modal save (includes client meta fields)
  elements.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = document.getElementById("task-id").value;
    const title = (document.getElementById("task-title").value || "").trim();
    const description = (document.getElementById("task-description").value || "").trim();
    const tags = (document.getElementById("task-tags")?.value || "").trim();
    const dueVal = document.getElementById("task-dueDate")?.value || "";
    const statusEl = document.getElementById("task-columnId");
    const doneEl = document.getElementById("task-isDone");

    if (!title) { showToast("Title is required.", "warning"); return; }

    const selectedColumn = statusEl ? Number(statusEl.value) : 1;
    const isDoneChecked = doneEl ? !!doneEl.checked : false;
    const columnId = isDoneChecked ? 3 : selectedColumn;
    const dueDate = dueVal ? new Date(dueVal).toISOString() : null;

    const payload = { title, isDone: columnId === 3, columnId, description, tags, dueDate };

    let ok = false;
    if (taskId) {
      ok = await updateTask(taskId, payload);
      if (ok) showToast("Task updated!", "success");
    } else {
      ok = await createTask(payload);
      if (ok) showToast("Task created!", "success");
    }
    if (ok) closeModal();
  });

  elements.taskDelete.addEventListener("click", async () => {
    const id = document.getElementById("task-id").value;
    if (!id) return;
    if (confirm("Delete this task?")) {
      await deleteTask(id);
      closeModal();
    }
  });

  wireQuickAddForms();
}

document.addEventListener("DOMContentLoaded", init);

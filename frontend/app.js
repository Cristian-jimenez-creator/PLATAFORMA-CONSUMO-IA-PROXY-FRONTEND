const apiBase = (window.APP_CONFIG?.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const userId = localStorage.getItem("tokenia-user-id") || (() => {
  const id = crypto.randomUUID();
  localStorage.setItem("tokenia-user-id", id);
  return id;
})();
const elements = Object.fromEntries(["promptForm", "promptInput", "sendButton", "estimate", "messages", "tokensUsed", "tokensLimit", "tokensRemaining", "quotaProgress", "quotaPercent", "rateLimit", "historyChart", "planBadge", "sidebarPlan", "sidebarUsage", "upgradeModal", "toast", "confirmUpgrade"].map(id => [id, document.getElementById(id)]));
let quota = null;
let toastTimer;

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3600);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "No se pudo completar la solicitud.");
    error.status = response.status;
    error.retrySeconds = Number(error.message.match(/(\d+) seconds/)?.[1] || 0);
    throw error;
  }
  return data;
}

async function refreshDashboard() {
  try {
    const [currentQuota, history] = await Promise.all([
      request(`/api/quota?userId=${encodeURIComponent(userId)}`),
      request(`/api/quota/history?userId=${encodeURIComponent(userId)}`)
    ]);
    quota = currentQuota;
    const unlimited = quota.monthlyLimit === null;
    const percent = unlimited ? 0 : Math.min(100, quota.tokensUsed / quota.monthlyLimit * 100);
    elements.tokensUsed.textContent = formatNumber(quota.tokensUsed);
    elements.tokensLimit.textContent = unlimited ? "/ ∞" : `/ ${formatNumber(quota.monthlyLimit)}`;
    elements.tokensRemaining.textContent = unlimited ? "Sin límite" : `${formatNumber(quota.tokensRemaining)} disponibles`;
    elements.quotaPercent.textContent = unlimited ? "Uso sin límite mensual" : `${Math.round(percent)}% utilizado`;
    elements.quotaProgress.style.width = unlimited ? "8%" : `${percent}%`;
    elements.quotaProgress.classList.toggle("near-limit", percent >= 80);
    elements.planBadge.textContent = quota.plan;
    elements.planBadge.className = `current-plan ${quota.plan.toLowerCase()}`;
    elements.sidebarPlan.textContent = quota.plan;
    elements.sidebarUsage.textContent = unlimited ? `${formatNumber(quota.tokensUsed)} tokens usados` : `${formatNumber(quota.tokensRemaining)} tokens disponibles`;
    elements.rateLimit.textContent = quota.requestsPerMinute === null ? "Solicitudes ilimitadas" : `${quota.requestsPerMinute} solicitudes por minuto`;
    renderHistory(history.days || []);
  } catch (error) {
    showToast("No se pudo conectar con el servicio. Revisa la URL de la API.");
    elements.rateLimit.textContent = "Servicio no disponible";
  }
}

function renderHistory(days) {
  const max = Math.max(1, ...days.map(day => day.tokens));
  elements.historyChart.replaceChildren(...days.map(day => {
    const column = document.createElement("div");
    column.className = "chart-column";
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = `${Math.max(4, day.tokens / max * 100)}%`;
    bar.title = `${day.date}: ${formatNumber(day.tokens)} tokens`;
    const label = document.createElement("span");
    label.textContent = new Date(`${day.date}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short" }).slice(0, 2);
    column.append(bar, label);
    return column;
  }));
}

function addMessage(role, text, meta = "") {
  const welcome = elements.messages.querySelector(".welcome-card");
  if (welcome) welcome.remove();
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "Tú" : "✳";
  const content = document.createElement("div");
  content.className = "message-content";
  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "Tú" : "Tokenia";
  const body = document.createElement("p");
  body.textContent = text;
  content.append(label, body);
  if (meta) {
    const detail = document.createElement("small");
    detail.className = "message-meta";
    detail.textContent = meta;
    content.append(detail);
  }
  row.append(avatar, content);
  elements.messages.append(row);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

elements.promptInput.addEventListener("input", () => {
  elements.estimate.textContent = `~${Math.ceil(elements.promptInput.value.length / 4)} tokens`;
  elements.promptInput.style.height = "auto";
  elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, 180)}px`;
});

elements.promptInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.promptForm.requestSubmit();
  }
});

elements.promptForm.addEventListener("submit", async event => {
  event.preventDefault();
  const prompt = elements.promptInput.value.trim();
  if (!prompt || elements.sendButton.disabled) return;
  addMessage("user", prompt);
  elements.promptInput.value = "";
  elements.promptInput.dispatchEvent(new Event("input"));
  elements.sendButton.disabled = true;
  elements.sendButton.textContent = "…";
  try {
    const result = await request("/api/ai/generate", { method: "POST", body: JSON.stringify({ userId, prompt }) });
    addMessage("assistant", result.response, `${formatNumber(result.tokensUsed)} tokens · Respuesta simulada`);
    await refreshDashboard();
  } catch (error) {
    if (error.status === 429) showToast(`Alcanzaste el límite. Intenta de nuevo en ${error.retrySeconds || 60} segundos.`);
    else if (error.status === 402) {
      showToast("Agotaste tu cuota mensual. Mejora tu plan para continuar.");
      elements.upgradeModal.classList.remove("hidden");
    } else showToast(error.message);
    await refreshDashboard();
  } finally {
    elements.sendButton.disabled = false;
    elements.sendButton.textContent = "↑";
    elements.promptInput.focus();
  }
});

document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => {
  elements.promptInput.value = button.dataset.prompt;
  elements.promptInput.dispatchEvent(new Event("input"));
  elements.promptInput.focus();
}));

function openUpgrade() { elements.upgradeModal.classList.remove("hidden"); }
function closeUpgrade() { elements.upgradeModal.classList.add("hidden"); }
document.getElementById("upgradeButton").addEventListener("click", openUpgrade);
document.getElementById("sidebarUpgrade").addEventListener("click", openUpgrade);
document.getElementById("planInfoButton").addEventListener("click", openUpgrade);
document.getElementById("closeModal").addEventListener("click", closeUpgrade);
elements.upgradeModal.addEventListener("click", event => { if (event.target === elements.upgradeModal) closeUpgrade(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeUpgrade(); });

elements.confirmUpgrade.addEventListener("click", async () => {
  elements.confirmUpgrade.disabled = true;
  elements.confirmUpgrade.textContent = "Activando…";
  try {
    await request("/api/quota/upgrade", { method: "POST", body: JSON.stringify({ userId }) });
    closeUpgrade();
    showToast("¡Ya tienes el plan PRO! Tu nueva cuota está activa.");
    await refreshDashboard();
  } catch (error) { showToast(error.message); }
  finally { elements.confirmUpgrade.disabled = false; elements.confirmUpgrade.innerHTML = "Activar PRO <span>→</span>"; }
});

document.getElementById("refreshButton").addEventListener("click", refreshDashboard);
document.getElementById("newChatButton").addEventListener("click", () => {
  elements.messages.replaceChildren();
  const card = document.createElement("div");
  card.className = "welcome-card";
  card.innerHTML = '<div class="sparkle">✳</div><h2>Tu espacio para crear</h2><p>Pídele a la IA que te ayude a escribir, explorar ideas o resolver una duda.</p><div class="suggestions"><button data-prompt="Dame tres ideas creativas para un proyecto nuevo">✦ <span>Dame ideas creativas</span></button><button data-prompt="Explícame un tema complejo de forma sencilla">▤ <span>Explícame un tema</span></button><button data-prompt="Ayúdame a redactar un mensaje profesional">↗ <span>Redacta un mensaje</span></button></div>';
  elements.messages.append(card);
  card.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { elements.promptInput.value = button.dataset.prompt; elements.promptInput.dispatchEvent(new Event("input")); elements.promptInput.focus(); }));
});
document.getElementById("helpButton").addEventListener("click", () => showToast("Escribe un mensaje y presiona Enter para conversar."));
refreshDashboard();

/**
 * Anonyx Pro Admin Dashboard Controller
 * Singleton sync logic for operational monitoring and moderation.
 * Resiliency Edition v3.0 - Event Delegation & Smart Logic.
 */

const escapeAttr = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const DashboardController = {
    isFetching: false,
    intervalTimer: null,
    refreshIntervalMs: 20000,
    liveChart: null,
    heatmapChart: null,
    adminSocket: null,
    lastLiveMetrics: null,

    /**
     * Initialization Sequence
     */
    async init() {
        console.log("[Admin] Initializing command center...");

        this.wireEvents();
        this.wireTableDelegates();
        this.wireExportButtons();

        try {
            const authData = await AdminAPI.safeFetch("/admin/me");
            const sessUserEl = document.getElementById("sessUser");
            if (sessUserEl) sessUserEl.innerText = authData.admin?.username || "admin";

            this.initChart();
            this.initHeatmapChart();
            this.connectAdminSocket();

            await this.guardedRefresh();

            if (this.intervalTimer) clearInterval(this.intervalTimer);
            this.intervalTimer = setInterval(() => this.guardedRefresh(), this.refreshIntervalMs);

            console.log("[Admin] Boot sequence complete.");

            if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();

        } catch (err) {
            console.error("[Admin] Boot Failure:", err.message);
        }
    },

    connectAdminSocket() {
        if (typeof io === "undefined") return;
        try {
            this.adminSocket = io({ transports: ["websocket", "polling"], withCredentials: true });
            this.adminSocket.on("connect", () => {
                this.adminSocket.emit("admin:subscribe");
            });
            this.adminSocket.on("admin:ready", () => {
                const el = document.getElementById("liveSocketState");
                if (el) {
                    el.innerText = "live socket";
                    el.style.color = "var(--accent)";
                }
            });
            this.adminSocket.on("admin:error", () => {
                const el = document.getElementById("liveSocketState");
                if (el) {
                    el.innerText = "socket auth failed — using REST";
                    el.style.color = "var(--danger)";
                }
            });
            this.adminSocket.on("admin:metrics", (m) => {
                this.lastLiveMetrics = m;
                this.applyLiveMetrics(m);
            });
        } catch (e) {
            console.warn("[Admin] Socket unavailable", e);
        }
    },

    applyLiveMetrics(m) {
        if (!m) return;
        const q = document.getElementById("liveQueue");
        const g = document.getElementById("liveGroups");
        const rpm = document.getElementById("liveMsgPerMin");
        if (q) q.innerText = m.waitingInQueue ?? "—";
        if (g) g.innerText = m.activeGroupRooms ?? "—";
        if (rpm) rpm.innerText = m.messagesPerMinute ?? "0";

        if (this.liveChart && typeof m.onlineUsers === "number") {
            const now = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            this.liveChart.data.labels.push(now);
            this.liveChart.data.datasets[0].data.push(m.onlineUsers);
            if (this.liveChart.data.datasets[1]) {
                this.liveChart.data.datasets[1].data.push(m.messagesPerMinute || 0);
            }
            const maxPts = 40;
            while (this.liveChart.data.labels.length > maxPts) {
                this.liveChart.data.labels.shift();
                this.liveChart.data.datasets.forEach((ds) => ds.data.shift());
            }
            this.liveChart.update("none");
        }
    },

    wireExportButtons() {
        const dl = async (path, filename) => {
            const res = await fetch(path, { credentials: "include" });
            if (res.status === 401) {
                window.location.href = "/admin/login";
                return;
            }
            if (!res.ok) {
                alert("Export failed");
                return;
            }
            const blob = await res.blob();
            const u = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = u;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(u);
        };
        const bind = (id, path, file) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => dl(path, file);
        };
        bind("exportAnalyticsCsv", "/admin/export/analytics?format=csv", "anonyx-analytics.csv");
        bind("exportAnalyticsJson", "/admin/export/analytics?format=json", "anonyx-analytics.json");
        bind("exportReportsCsv", "/admin/export/reports?format=csv", "anonyx-reports.csv");
        bind("exportBansCsv", "/admin/export/bans?format=csv", "anonyx-bans.csv");
    },

    /**
     * Resilient Event Listener Wiring (Static)
     */
    wireEvents() {
        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el) {
                el.onclick = (e) => {
                    if (e) e.preventDefault();
                    handler();
                };
            }
        };

        bind("logoutBtn", () => Moderation.logout());
        bind("refreshHeaderBtn", () => this.guardedRefresh());
        bind("refreshReportsBtn", () => this.guardedRefresh());
        bind("flushBacklogBtn", () => Moderation.resolveAll());
        bind("broadcastBtn", () => Moderation.announce());

        bind("manualBanBtn", () => Moderation.banUser());
        bind("ipBanBtn", () => Moderation.banIp());
    },

    /**
     * Smart Event Delegation (Dynamic Tables)
     */
    wireTableDelegates() {
        const handleTableClick = (tableId, actionMap) => {
            const table = document.getElementById(tableId);
            if (!table) return;

            table.onclick = (e) => {
                const btn = e.target.closest("button[data-action]");
                if (!btn) return;

                const action = btn.getAttribute("data-action");
                const id = btn.getAttribute("data-id");
                const reason = btn.getAttribute("data-reason");

                if (actionMap[action]) {
                    console.info(`[Action] ${action} triggered for: ${id}`);
                    actionMap[action](id, reason);
                }
            };
            console.info(`[Smart Wiring] Activated delegator for #${tableId}`);
        };

        // Reports Table
        handleTableClick("reportsTable", {
            "ban": (id, reason) => Moderation.banUser(id, reason),
            "resolve": (id) => Moderation.resolveReport(id)
        });

        // Bans Table
        handleTableClick("bansTable", {
            "pardon": (id) => Moderation.unban(id)
        });

        // Rooms Table
        handleTableClick("roomsTable", {
            "terminate": (id) => Moderation.closeRoom(id)
        });
    },

    /**
     * Singleton Refresh Layer
     */
    async guardedRefresh() {
        if (this.isFetching) return;
        this.isFetching = true;
        const syncLoader = document.getElementById("sync-loader");

        try {
            console.log("[Sync] Pulling system state...");
            
            const [stats, reports, bans, rooms] = await Promise.allSettled([
                AdminAPI.safeFetch("/api/stats"),
                AdminAPI.safeFetch("/admin/reports"),
                AdminAPI.safeFetch("/admin/banned"),
                AdminAPI.safeFetch("/admin/rooms")
            ]);

            // Counters
            if (stats.status === 'fulfilled') this.renderStats(stats.value);

            // Tables
            this.renderReports(reports.status === 'fulfilled' ? reports.value : []);
            this.renderBans(bans.status === 'fulfilled' ? bans.value : []);
            this.renderRooms(rooms.status === 'fulfilled' ? rooms.value : []);

        } catch (err) {
            console.error("[Sync] Fetch Crash:", err.message);
        } finally {
            this.isFetching = false;
            
            // Hide sync loader on completion
            if (syncLoader && syncLoader.style.display !== "none") {
                syncLoader.style.opacity = "0";
                setTimeout(() => { syncLoader.style.display = "none"; }, 500);
            }
        }
    },

    /**
     * UI Render Logic
     */
    initChart() {
        const chartCanvas = document.getElementById("liveChart");
        if (chartCanvas && typeof Chart !== "undefined") {
            const ctx = chartCanvas.getContext("2d");
            this.liveChart = new Chart(ctx, {
                type: "line",
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: "Online users",
                            data: [],
                            borderColor: "#6366f1",
                            backgroundColor: "rgba(99, 102, 241, 0.08)",
                            fill: true,
                            tension: 0.35,
                            pointRadius: 0,
                            yAxisID: "y"
                        },
                        {
                            label: "Msgs/min",
                            data: [],
                            borderColor: "#f472b6",
                            backgroundColor: "rgba(244, 114, 182, 0.05)",
                            fill: false,
                            tension: 0.35,
                            pointRadius: 0,
                            yAxisID: "y1"
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            labels: { color: "#94a3b8", boxWidth: 12, font: { size: 10 } }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: "#94a3b8", maxRotation: 0 } },
                        y: {
                            type: "linear",
                            position: "left",
                            grid: { color: "#2d3748" },
                            ticks: { color: "#94a3b8" }
                        },
                        y1: {
                            type: "linear",
                            position: "right",
                            grid: { drawOnChartArea: false },
                            ticks: { color: "#f472b6" }
                        }
                    }
                }
            });
        }
    },

    initHeatmapChart() {
        const el = document.getElementById("heatmapChart");
        if (!el || typeof Chart === "undefined") return;
        const hours = Array.from({ length: 24 }, (_, i) => `${i}h`);
        this.heatmapChart = new Chart(el.getContext("2d"), {
            type: "bar",
            data: {
                labels: hours,
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: "#94a3b8", boxWidth: 10, font: { size: 9 } }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: "#94a3b8", maxRotation: 0, font: { size: 9 } },
                        grid: { color: "#2d3748" }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: "#94a3b8" },
                        grid: { color: "#2d3748" }
                    }
                }
            }
        });
    },

    updateHeatmapFromStats(stats) {
        if (!this.heatmapChart || !stats || !stats.heatmap) return;
        const keys = Object.keys(stats.heatmap).filter((k) => Array.isArray(stats.heatmap[k]));
        if (!keys.length) return;
        const palette = ["#6366f1", "#2dd4bf", "#a855f7", "#f472b6", "#f97316", "#22c55e", "#eab308"];
        this.heatmapChart.data.datasets = keys.map((k, i) => ({
            label: k.replace(/_/g, " "),
            data: stats.heatmap[k] || [],
            backgroundColor: palette[i % palette.length] + "aa"
        }));
        this.heatmapChart.update();
        const abEl = document.getElementById("abStatsPanel");
        if (abEl && stats.abStats && typeof stats.abStats === "object") {
            const rows = Object.entries(stats.abStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([k, v]) => `<div><code>${AdminAPI.sanitize(k)}</code> → ${v}</div>`)
                .join("");
            abEl.innerHTML = rows ? `<span class="admin-ab-title">A/B &amp; funnel beacons</span>${rows}` : "";
        }
    },

    renderStats(stats) {
        const liveUsers = stats.activeUsers ?? stats.onlineUsers ?? 0;
        const matches = stats.matches ?? 0;
        const matchRate = stats.matchRate ?? 0;

        const onlineCountEl = document.getElementById("onlineCount");
        const matchesCountEl = document.getElementById("matchesCount");
        const msgRateEl = document.getElementById("msgRate");

        if (onlineCountEl) onlineCountEl.innerText = liveUsers;
        if (matchesCountEl) matchesCountEl.innerText = matches;
        if (msgRateEl) msgRateEl.innerText = `${matchRate}%`;

        this.updateHeatmapFromStats(stats);

        if (this.liveChart && !this.adminSocket?.connected) {
            const now = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
            this.liveChart.data.labels.push(now);
            this.liveChart.data.datasets[0].data.push(liveUsers);
            if (this.liveChart.data.datasets[1]) this.liveChart.data.datasets[1].data.push(0);
            if (this.liveChart.data.labels.length > 15) {
                this.liveChart.data.labels.shift();
                this.liveChart.data.datasets.forEach((ds) => ds.data.shift());
            }
            this.liveChart.update();
        }
    },

    renderReports(data) {
        const tbody = document.querySelector("#reportsTable tbody");
        if (!tbody) return;

        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="admin-td-muted">Backlog clear.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((r) => {
            const ridRaw = String(r.reportedId || "");
            const ridSafe = AdminAPI.sanitize(ridRaw);
            const reportIdRaw = String(r._id || "");
            const reportIdAttr = escapeAttr(reportIdRaw);
            const reasonRaw = String(r.reason || "No reason");
            const reasonSafe = AdminAPI.sanitize(reasonRaw);
            const reasonAttr = escapeAttr(`Reported: ${reasonRaw}`);
            
            return `
                <tr>
                    <td><span class="badge"><code>${ridSafe}</code></span></td>
                    <td>${reasonSafe}</td>
                    <td class="admin-td-muted">${r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-"}</td>
                    <td>
                        <div class="admin-actions-row">
                            <button class="btn btn-outline btn-sm btn-outline-danger" data-action="ban" data-id="${escapeAttr(ridRaw)}" data-reason="${reasonAttr}">Ban</button>
                            <button class="btn btn-outline btn-sm" data-action="resolve" data-id="${reportIdAttr}">Resolve</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    },

    renderBans(data) {
        const tbody = document.querySelector("#bansTable tbody");
        if (!tbody) return;

        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="admin-td-muted">Blacklist empty.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((b) => {
            const targetRaw = String(b.target || "-");
            const target = AdminAPI.sanitize(targetRaw);
            const typeClass = b.type === "Network" ? "badge badge-warning" : "badge";
            const typeLabel = b.type || "System";

            return `
                <tr>
                    <td><span class="${typeClass}">${typeLabel}</span></td>
                    <td><code>${target}</code></td>
                    <td>${AdminAPI.sanitize(b.reason || "Restriction Policy")}</td>
                    <td><button class="btn btn-outline btn-sm" data-action="pardon" data-id="${escapeAttr(targetRaw)}">Pardon</button></td>
                </tr>
            `;
        }).join("");
    },

    renderRooms(data) {
        const tbody = document.querySelector("#roomsTable tbody");
        if (!tbody) return;

        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="admin-td-muted">No active sessions.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((room) => {
            const roomId = String(room.id || "");
            const rtype = room.type === "group" ? "group" : "1:1";
            const users = Array.isArray(room.users) ? room.users : [];
            const startedAt = Number(room.startedAt || 0);
            const elapsed = startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0;

            return `
                <tr>
                    <td><span class="badge">${AdminAPI.sanitize(rtype)}</span></td>
                    <td><code>${AdminAPI.sanitize(roomId)}</code></td>
                    <td>${users.map((u) => AdminAPI.sanitize(String(u))).join(" · ")}</td>
                    <td class="admin-duration">${elapsed}s</td>
                    <td><button class="btn btn-outline btn-danger btn-sm" data-action="terminate" data-id="${escapeAttr(roomId)}">Close</button></td>
                </tr>
            `;
        }).join("");
    }
};

/**
 * Global Moderation Hub
 */
window.Moderation = {
    async banUser(targetId, reasonMsg) {
        const userId = targetId || document.getElementById("banTarget").value.trim();
        const reason = reasonMsg || document.getElementById("banReason").value.trim() || "Manual Restriction";

        if (!userId) {
            alert("Administrative Error: Target User ID required.");
            return;
        }

        console.info(`[Moderation] Applying user ban: ${userId} | Reason: ${reason}`);

        try {
            await AdminAPI.post("/admin/ban", { userId, reason });
            alert(`User ${userId} restriction applied.`);
            this.clearInputs();
            await DashboardController.guardedRefresh();
        } catch (err) {
            console.error(`[Moderation] User Ban failed:`, err);
            alert(`User Ban Failure: ${err.message}`);
        }
    },

    async banIp() {
        const ip = document.getElementById("banTarget").value.trim();
        const reason = document.getElementById("banReason").value.trim() || "Network Access Revoked";

        if (!ip) {
            alert("Administrative Error: Target IP Address required.");
            return;
        }

        console.info(`[Moderation] Applying IP ban: ${ip} | Reason: ${reason}`);

        try {
            await AdminAPI.post("/admin/ip-ban", { ip, reason });
            alert(`Network restriction applied for ${ip}.`);
            this.clearInputs();
            await DashboardController.guardedRefresh();
        } catch (err) {
            console.error(`[Moderation] IP Ban failed:`, err);
            alert(`IP Ban Failure: ${err.message}`);
        }
    },

    async unban(userId) {
        console.info(`[Moderation] Requesting pardon for: ${userId}`);
        if (!confirm(`Restore system access for ${userId}?`)) return;
        try {
            await AdminAPI.delete(`/admin/unban/${userId}`);
            await DashboardController.guardedRefresh();
        } catch (err) {
            alert(`Pardon Failure: ${err.message}`);
        }
    },

    async resolveReport(id) {
        console.info(`[Moderation] Resolving report index: ${id}`);
        if (!confirm("Is this report resolved?")) return;
        try {
            await AdminAPI.delete(`/admin/report/${id}`);
            await DashboardController.guardedRefresh();
        } catch (err) {
            alert(`Resolve Failure: ${err.message}`);
        }
    },

    async resolveAll() {
        console.info(`[Moderation] FLUSHING administrative backlog...`);
        if (!confirm("Clear administrative backlog? This action is permanent.")) return;
        try {
            await AdminAPI.post("/admin/resolve-all");
            await DashboardController.guardedRefresh();
        } catch (err) {
            alert(`Flush Failure: ${err.message}`);
        }
    },

    async announce() {
        const input = document.getElementById("announceMsg");
        const message = input?.value.trim();
        if (!message) return;

        try {
            await AdminAPI.post("/admin/announce", { message });
            alert("System wide broadcast successful.");
            input.value = "";
        } catch (err) {
            alert(`Broadcast Failure: ${err.message}`);
        }
    },

    async closeRoom(roomId) {
        console.info(`[Moderation] Terminating private session room: ${roomId}`);
        if (!confirm("Force terminate this match session?")) return;
        try {
            await AdminAPI.post(`/admin/close-room/${roomId}`);
            await DashboardController.guardedRefresh();
        } catch (err) {
            alert(`Room Close Failure: ${err.message}`);
        }
    },

    async logout() {
        console.warn("[Session] Administrator logging out...");
        if (!confirm("Are you sure you want to log out?")) return;
        try {
            await AdminAPI.post("/admin/logout");
        } finally {
            window.location.href = "/admin/login";
        }
    },

    clearInputs() {
        const target = document.getElementById("banTarget");
        const reason = document.getElementById("banReason");
        if (target) target.value = "";
        if (reason) reason.value = "";
    }
};

/**
 * Launch Controller
 */
document.addEventListener("DOMContentLoaded", () => DashboardController.init());

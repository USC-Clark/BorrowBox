function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "The request could not be completed.");
    return data;
}

function showFormMessage(element, message, success = false) {
    element.textContent = message;
    element.className = `alert ${success ? "alert-success" : "alert-error"}`;
    element.style.display = "flex";
}

function formatScheduledTime(value) {
    const localDateTime = value.replace(" ", "T");
    const utcDateTime = `${localDateTime.length === 16 ? `${localDateTime}:00` : localDateTime}Z`;
    const date = new Date(utcDateTime);
    if (!Number.isFinite(date.getTime())) return value;
    return date.toLocaleString(undefined, { timeZone: "UTC" });
}

function formatBorrowWindow(item) {
    if (!item.available_from || !item.return_by) return item.availability;
    return `${formatScheduledTime(item.available_from)} – ${formatScheduledTime(item.return_by)}`;
}

function setNavigation(user) {
    const nav = document.querySelector(".nav-links");
    if (!nav) return;
    const links = [
        '<li><a href="dashboard.html" class="nav-link">Browse</a></li>'
    ];
    if (user) {
        if (user.role === "user") {
            links.push('<li><a href="post.html" class="nav-link nav-btn">+ Post an Item</a></li>');
            links.push('<li><a href="activity.html" class="nav-link">Requests &amp; Returns</a></li>');
        }
        links.push('<li class="nav-spacer" aria-hidden="true"></li>');
        if (user.role === "admin") {
            links.push('<li><a href="admin.html" class="nav-link nav-admin">Admin</a></li>');
        }
        links.push(`
            <li class="nav-account-menu">
                <button type="button" class="account-trigger" id="accountTrigger"
                    aria-label="Open account menu" aria-expanded="false" aria-controls="accountDropdown">
                    <svg class="account-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>
                    </svg>
                </button>
                <div class="account-dropdown" id="accountDropdown" hidden>
                    <span class="account-name">${escapeHtml(user.name)}</span>
                    <a href="settings.html" class="account-dropdown-link">Account settings</a>
                    <button type="button" class="account-dropdown-logout" id="logoutButton">Log out</button>
                </div>
            </li>
        `);
    } else {
        links.push('<li class="nav-spacer" aria-hidden="true"></li>');
        links.push('<li><a href="login.html" class="nav-link">Log in</a></li>');
        links.push('<li><a href="register.html" class="nav-link nav-btn">Create account</a></li>');
    }
    nav.innerHTML = links.join("");

    const accountTrigger = document.getElementById("accountTrigger");
    const accountDropdown = document.getElementById("accountDropdown");
    if (accountTrigger && accountDropdown) {
        accountTrigger.addEventListener("click", () => {
            const isExpanded = accountTrigger.getAttribute("aria-expanded") === "true";
            accountTrigger.setAttribute("aria-expanded", String(!isExpanded));
            accountDropdown.hidden = isExpanded;
        });
        document.addEventListener("click", (event) => {
            if (!event.target.closest(".nav-account-menu")) {
                accountDropdown.hidden = true;
                accountTrigger.setAttribute("aria-expanded", "false");
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                accountDropdown.hidden = true;
                accountTrigger.setAttribute("aria-expanded", "false");
                accountTrigger.focus();
            }
        });
    }

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            try {
                await apiRequest("/api/auth/logout", { method: "POST" });
                window.location.href = "login.html";
            } catch (error) {
                window.alert(error.message);
            }
        });
    }
}

function initDashboard() {
    const grid = document.getElementById("listingsGrid");
    if (!grid) return;

    const noResults = document.getElementById("noResults");
    const resultsCount = document.getElementById("resultsCount");
    const searchInput = document.getElementById("searchInput");
    const filterButtons = document.querySelectorAll(".filter-btn");
    let allItems = [];
    let activeCategory = "All";

    function createCard(item) {
        return `
            <article class="listing-card" data-category="${escapeHtml(item.category)}">
                <div class="card-top">
                    <h3 class="card-title">${escapeHtml(item.item_name)}</h3>
                    <span class="category-badge">${escapeHtml(item.category)}</span>
                </div>
                <ul class="card-meta-list">
                    <li class="card-meta-item"><span class="card-meta-label">Borrow period:</span><span class="card-meta-value">${escapeHtml(formatBorrowWindow(item))}</span></li>
                    <li class="card-meta-item"><span class="card-meta-label">Location:</span><span class="card-meta-value">${escapeHtml(item.location)}</span></li>
                    <li class="card-meta-item"><span class="card-meta-label">Condition:</span><span class="card-meta-value">${escapeHtml(item.item_condition)}</span></li>
                </ul>
                <div class="card-footer"><a href="details.html?id=${encodeURIComponent(item.id)}" class="btn btn-primary">View Details</a></div>
            </article>
        `;
    }

    function render() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = allItems.filter((item) => {
            const matchesCategory = activeCategory === "All" || item.category === activeCategory;
            const matchesSearch = !query ||
                item.item_name.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query) ||
                item.location.toLowerCase().includes(query);
            return matchesCategory && matchesSearch;
        });
        grid.innerHTML = filtered.map(createCard).join("");
        grid.appendChild(noResults);
        noResults.innerHTML = "<p><strong>No listings found</strong></p><p>Try searching for a different keyword or select another category.</p>";
        noResults.style.display = filtered.length === 0 ? "block" : "none";
        resultsCount.textContent = `Showing ${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
    }

    async function loadItems() {
        try {
            allItems = await apiRequest("/api/items");
            render();
        } catch (error) {
            console.error(error);
            grid.innerHTML = "";
            resultsCount.textContent = "Could not load items";
            noResults.textContent = error.message;
            noResults.style.display = "block";
            grid.appendChild(noResults);
        }
    }

    searchInput.addEventListener("input", render);
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            filterButtons.forEach((filter) => filter.classList.remove("active"));
            button.classList.add("active");
            activeCategory = button.dataset.category;
            render();
        });
    });
    loadItems();
}

function initDetails() {
    const card = document.querySelector(".detail-card");
    const borrowButton = document.getElementById("borrowBtn");
    if (!card || !borrowButton) return;
    const alertBox = document.getElementById("requestSuccessAlert");
    let itemId;

    function showMessage(message) {
        card.innerHTML = `
            <h1 class="detail-title">${escapeHtml(message)}</h1>
            <div class="detail-actions"><a href="dashboard.html" class="btn btn-secondary">Back to Listings</a></div>
        `;
    }

    function fillDetails(item) {
        document.title = `${item.item_name} | BorrowBox`;
        document.querySelector(".detail-title").textContent = item.item_name;
        document.querySelector(".detail-top-badges .category-badge").textContent = item.category;
        const labels = document.querySelectorAll(".detail-meta-grid .meta-label");
        const values = document.querySelectorAll(".detail-meta-grid .meta-value");
        values[0].textContent = item.category;
        values[1].textContent = item.status;
        values[1].style.color = item.status === "Available" ? "var(--color-success)" : "var(--color-text-muted)";
        values[2].textContent = item.item_condition;
        labels[3].textContent = "Availability";
        values[3].textContent = formatBorrowWindow(item);
        values[4].textContent = item.location;
        document.querySelector(".detail-description").textContent = item.description || "No description provided.";
        const lenderValues = document.querySelectorAll(".lender-value");
        lenderValues[0].textContent = item.owner_name || "BorrowBox Member";
        lenderValues[1].textContent = item.preferred_contact || "Not provided";
        if (item.file_attachment) {
            const img = document.createElement("img");
            img.src = `/${item.file_attachment}`;
            img.alt = item.item_name;
            img.className = "detail-image";
            document.querySelector(".detail-section-title").before(img);
        }
        borrowButton.disabled = item.status !== "Available";
        if (item.status !== "Available") borrowButton.textContent = "Currently Unavailable";
    }

    async function loadDetails() {
        itemId = new URLSearchParams(window.location.search).get("id");
        if (!itemId) return showMessage("No item selected");
        try {
            fillDetails(await apiRequest(`/api/items/${encodeURIComponent(itemId)}`));
        } catch (error) {
            console.error(error);
            showMessage(error.message);
        }
    }

    borrowButton.addEventListener("click", async () => {
        borrowButton.disabled = true;
        try {
            const result = await apiRequest(`/api/items/${encodeURIComponent(itemId)}/borrow`, { method: "POST" });
            showFormMessage(alertBox, result.message, true);
            borrowButton.textContent = "Request Sent";
        } catch (error) {
            showFormMessage(alertBox, error.message);
            borrowButton.disabled = false;
        }
    });
    loadDetails();
}

function initPostForm() {
    const form = document.getElementById("postItemForm");
    if (!form) return;
    const alertBox = document.getElementById("postSuccessAlert");
    const availableFrom = form.elements.availableFrom;
    const returnBy = form.elements.returnBy;
    const timeZoneNote = document.getElementById("scheduleTimezone");
    apiRequest("/api/calendar/status")
        .then((status) => { timeZoneNote.textContent = `Times use ${status.timeZone}.`; })
        .catch((error) => console.error("Could not load BorrowBox time zone:", error));

    availableFrom.addEventListener("input", () => {
        returnBy.min = availableFrom.value;
        if (returnBy.value && returnBy.value <= availableFrom.value) returnBy.value = "";
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (availableFrom.value >= returnBy.value) {
            showFormMessage(alertBox, "The return date and time must be after the available-from date and time.");
            return;
        }
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
            await apiRequest("/api/items", {
                method: "POST",
                body: new FormData(form)
            });
            showFormMessage(alertBox, "Your item is listed. Returning to the browse page...", true);
            form.reset();
            setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
        } catch (error) {
            showFormMessage(alertBox, error.message);
            submitButton.disabled = false;
        }
    });
}

function initLogin() {
    const form = document.getElementById("loginForm");
    if (!form) return;
    const message = document.getElementById("formMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await apiRequest("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(new FormData(form)))
            });
            const next = new URLSearchParams(window.location.search).get("next");
            const safeNext = next && /^[a-zA-Z0-9_.-]+\.html(?:\?.*)?$/.test(next) ? next : "dashboard.html";
            window.location.href = safeNext;
        } catch (error) {
            showFormMessage(message, error.message);
            button.disabled = false;
        }
    });
}

function initRegister() {
    const form = document.getElementById("registerForm");
    if (!form) return;
    const message = document.getElementById("formMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        if (values.password !== values.confirmPassword) {
            showFormMessage(message, "The passwords do not match.");
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await apiRequest("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: values.name, email: values.email, password: values.password })
            });
            window.location.href = "dashboard.html";
        } catch (error) {
            showFormMessage(message, error.message);
            button.disabled = false;
        }
    });
}

function initSettings() {
    const form = document.getElementById("passwordForm");
    if (!form) return;
    const message = document.getElementById("formMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        if (values.newPassword !== values.confirmPassword) {
            showFormMessage(message, "The new passwords do not match.");
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await apiRequest("/api/auth/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: values.currentPassword,
                    newPassword: values.newPassword
                })
            });
            showFormMessage(message, result.message, true);
            form.reset();
        } catch (error) {
            showFormMessage(message, error.message);
        } finally {
            button.disabled = false;
        }
    });
}

async function initCalendarSettings() {
    const status = document.getElementById("calendarStatus");
    if (!status) return;
    const connect = document.getElementById("connectCalendarButton");
    const disconnect = document.getElementById("disconnectCalendarButton");
    const query = new URLSearchParams(window.location.search);
    const result = query.get("calendar");
    const resultMessages = {
        connected: "Google Calendar connected. Accepted borrowing requests will be added to this calendar.",
        cancelled: "Google Calendar connection was cancelled.",
        invalid: "Google Calendar connection expired. Please try again.",
        failed: "Google Calendar could not be connected. Check your Google OAuth settings and try again.",
        "missing-token": "Google did not provide a refresh token. Try connecting again and grant calendar access."
    };
    if (result && resultMessages[result]) {
        showFormMessage(status, resultMessages[result], result === "connected");
        window.history.replaceState({}, "", window.location.pathname);
    }

    try {
        const calendar = await apiRequest("/api/calendar/status");
        if (!calendar.configured) {
            status.textContent = "Google Calendar is not configured on the server yet. Ask the project administrator to complete the setup in the README.";
            status.className = "calendar-note";
            connect.hidden = true;
            disconnect.hidden = true;
            return;
        }
        connect.hidden = calendar.connected;
        disconnect.hidden = !calendar.connected;
        if (calendar.connected) {
            status.textContent = `Connected to ${calendar.email}. Accepted borrowing periods will be added to this calendar.`;
            status.className = "calendar-note calendar-note-success";
        } else if (!resultMessages[result]) {
            status.textContent = "Connect the Google account where you want accepted borrowing periods added.";
            status.className = "calendar-note";
        }
    } catch (error) {
        showFormMessage(status, error.message);
    }

    disconnect.addEventListener("click", async () => {
        disconnect.disabled = true;
        try {
            const response = await apiRequest("/api/calendar/connection", { method: "DELETE" });
            status.textContent = response.message;
            status.className = "calendar-note";
            connect.hidden = false;
            disconnect.hidden = true;
        } catch (error) {
            showFormMessage(status, error.message);
        } finally {
            disconnect.disabled = false;
        }
    });
}

function initAdmin() {
    const container = document.getElementById("adminContent");
    if (!container) return;
    const message = document.getElementById("adminMessage");

    function renderTableRows(rows, columns, emptyMessage) {
        if (!rows.length) return `<tr><td colspan="${columns}" class="table-empty">${emptyMessage}</td></tr>`;
        return rows;
    }

    async function loadOverview() {
        const data = await apiRequest("/api/admin/overview");
        document.getElementById("borrowerCount").textContent = data.stats.borrowers;
        document.getElementById("itemCount").textContent = data.stats.items;
        document.getElementById("requestCount").textContent = data.stats.requests;
        document.getElementById("pendingCount").textContent = data.stats.pending;
        document.getElementById("activeCount").textContent = data.stats.active;
        document.getElementById("returnConfirmationCount").textContent = data.stats.awaitingReturnConfirmation;
        document.getElementById("returnedCount").textContent = data.stats.returned;
        document.getElementById("borrowersBody").innerHTML = renderTableRows(
            data.borrowers.map((borrower) => `<tr><td>${escapeHtml(borrower.name)}</td><td>${escapeHtml(borrower.email)}</td><td>${escapeHtml(borrower.google_email || "Not connected")}</td><td>${borrower.request_count}</td></tr>`),
            4,
            "No borrower accounts yet."
        );
        document.getElementById("itemsBody").innerHTML = renderTableRows(
            data.items.map((item) => {
                const window = item.available_from && item.return_by
                    ? `${escapeHtml(formatScheduledTime(item.available_from))} – ${escapeHtml(formatScheduledTime(item.return_by))}`
                    : "Dates not set";
                return `<tr><td>${escapeHtml(item.item_name)}</td><td>${escapeHtml(item.owner_name)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.location)}</td><td>${window}</td><td><span class="status-pill">${escapeHtml(item.status)}</span></td></tr>`;
            }),
            6,
            "No items have been listed."
        );
        document.getElementById("requestsBody").innerHTML = renderTableRows(
            data.requests.map((request) => {
                const period = request.available_from && request.return_by
                    ? `${escapeHtml(formatScheduledTime(request.available_from))}<br>to ${escapeHtml(formatScheduledTime(request.return_by))}`
                    : "Dates not set";
                const returnDetails = [
                    request.borrower_returned_at
                        ? `Borrower reported: ${escapeHtml(formatScheduledTime(request.borrower_returned_at))}`
                        : "",
                    request.owner_returned_at
                        ? `Owner confirmed: ${escapeHtml(formatScheduledTime(request.owner_returned_at))}`
                        : ""
                ].filter(Boolean).join("<br>");
                return `<tr>
                    <td>${escapeHtml(formatScheduledTime(request.created_at))}</td>
                    <td>${escapeHtml(request.item_name)}<br><span class="table-muted">${escapeHtml(request.category)} · ${escapeHtml(request.location)}</span></td>
                    <td>${escapeHtml(request.borrower_name)}<br><span class="table-muted">${escapeHtml(request.borrower_email)}</span></td>
                    <td>${escapeHtml(request.owner_name || "—")}<br><span class="table-muted">${escapeHtml(request.owner_email || "")}</span></td>
                    <td>${period}</td>
                    <td><span class="status-pill">${escapeHtml(request.status)}</span>${returnDetails ? `<br><span class="table-muted">${returnDetails}</span>` : ""}</td>
                </tr>`;
            }),
            6,
            "No borrowing requests yet."
        );
    }

    loadOverview().catch((error) => showFormMessage(message, error.message));
}

function initActivity() {
    const container = document.getElementById("activityContent");
    if (!container) return;
    const message = document.getElementById("activityMessage");
    const retryButton = document.getElementById("activityRetry");
    const incomingBody = document.getElementById("incomingRequestsBody");
    const borrowedBody = document.getElementById("myBorrowingsBody");

    async function loadActivity() {
        retryButton.hidden = true;
        incomingBody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading requests for your listings...</td></tr>';
        borrowedBody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading your borrowing activity...</td></tr>';
        try {
            const data = await apiRequest("/api/my/activity");
            incomingBody.innerHTML = data.incoming.length
                ? data.incoming.map((request) => {
                let actions = "—";
                if (request.status === "Pending") {
                    actions = `<div class="table-actions">
                        <button class="btn btn-primary btn-small" data-owner-request="${request.id}" data-status="Approved">Accept</button>
                        <button class="btn btn-secondary btn-small" data-owner-request="${request.id}" data-status="Declined">Reject</button>
                    </div>`;
                } else if (request.status === "Return Pending") {
                    actions = `<button class="btn btn-primary btn-small" data-owner-request="${request.id}" data-status="Returned">Confirm return</button>`;
                }
                return `<tr>
                    <td>${escapeHtml(request.item_name)}<br><span class="table-muted">${escapeHtml(request.category)} · ${escapeHtml(request.location)}</span></td>
                    <td>${escapeHtml(request.borrower_name)}<br><span class="table-muted">${escapeHtml(request.borrower_email)}</span></td>
                    <td>${request.available_from && request.return_by
                        ? `${escapeHtml(formatScheduledTime(request.available_from))}<br>to ${escapeHtml(formatScheduledTime(request.return_by))}`
                        : "Dates not set"}</td>
                    <td><span class="status-pill">${escapeHtml(request.status)}</span></td>
                    <td>${actions}</td>
                </tr>`;
            }).join("")
                : '<tr><td colspan="5" class="table-empty">No requests for your listings yet.</td></tr>';

            borrowedBody.innerHTML = data.borrowed.length
                ? data.borrowed.map((request) => {
                const returnDetails = [
                    request.borrower_returned_at
                        ? `You reported: ${escapeHtml(formatScheduledTime(request.borrower_returned_at))}`
                        : "",
                    request.owner_returned_at
                        ? `Owner confirmed: ${escapeHtml(formatScheduledTime(request.owner_returned_at))}`
                        : ""
                ].filter(Boolean).join("<br>");
                const action = request.status === "Borrowing"
                    ? `<button class="btn btn-primary btn-small" data-borrower-return="${request.id}">Mark item returned</button>`
                    : request.status === "Return Pending"
                        ? '<span class="table-muted">Waiting for owner to confirm</span>'
                        : "—";
                return `<tr>
                    <td>${escapeHtml(request.item_name)}<br><span class="table-muted">${escapeHtml(request.category)} · ${escapeHtml(request.location)}</span></td>
                    <td>${escapeHtml(request.owner_name || "—")}<br><span class="table-muted">${escapeHtml(request.owner_email || "")}</span></td>
                    <td>${request.available_from && request.return_by
                        ? `${escapeHtml(formatScheduledTime(request.available_from))}<br>to ${escapeHtml(formatScheduledTime(request.return_by))}`
                        : "Dates not set"}</td>
                    <td><span class="status-pill">${escapeHtml(request.status)}</span>${returnDetails ? `<br><span class="table-muted">${returnDetails}</span>` : ""}</td>
                    <td>${action}</td>
                </tr>`;
            }).join("")
                : '<tr><td colspan="5" class="table-empty">You have not requested any items yet.</td></tr>';
            message.textContent = "";
            message.style.display = "none";
        } catch (error) {
            incomingBody.innerHTML = '<tr><td colspan="5" class="table-empty">Could not load listing requests.</td></tr>';
            borrowedBody.innerHTML = '<tr><td colspan="5" class="table-empty">Could not load borrowing activity.</td></tr>';
            showFormMessage(message, error.message);
            retryButton.hidden = false;
        }
    }

    retryButton.addEventListener("click", loadActivity);
    container.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-owner-request], [data-borrower-return]");
        if (!button) return;
        button.disabled = true;
        try {
            const isOwnerAction = button.hasAttribute("data-owner-request");
            const result = await apiRequest(
                isOwnerAction
                    ? `/api/owner/requests/${button.dataset.ownerRequest}`
                    : `/api/borrowings/${button.dataset.borrowerReturn}/return`,
                {
                    method: isOwnerAction ? "PATCH" : "POST",
                    ...(isOwnerAction ? {
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: button.dataset.status })
                    } : {})
                }
            );
            showFormMessage(message, result.message, true);
            await loadActivity();
        } catch (error) {
            showFormMessage(message, error.message);
            button.disabled = false;
        }
    });

    loadActivity().catch((error) => showFormMessage(message, error.message));
}

async function bootstrap() {
    if (window.location.protocol === "file:") {
        const pageContainer = document.querySelector("main .container") || document.querySelector("main");
        if (pageContainer) {
            const message = document.createElement("div");
            message.className = "alert alert-error";
            message.setAttribute("role", "status");
            message.textContent = "BorrowBox needs its server to be running. Start it with npm start, then open http://localhost:3000 in your browser instead of opening this HTML file directly.";
            pageContainer.prepend(message);
        }
        return;
    }

    const pathname = window.location.pathname;
    const authPage = pathname.endsWith("/login.html") || pathname.endsWith("/register.html");
    let user = null;
    try {
        user = (await apiRequest("/api/auth/me")).user;
    } catch (error) {
        console.error(error);
    }
    setNavigation(user);

    if (!authPage && !user) {
        const current = `${pathname.split("/").pop()}${window.location.search}`;
        window.location.href = `login.html?next=${encodeURIComponent(current)}`;
        return;
    }
    if (authPage && user) {
        window.location.href = "dashboard.html";
        return;
    }
    if (pathname.endsWith("/admin.html") && user.role !== "admin") {
        window.location.href = "dashboard.html";
        return;
    }

    initDashboard();
    initDetails();
    initPostForm();
    initLogin();
    initRegister();
    initSettings();
    initCalendarSettings();
    initAdmin();
    initActivity();
}

bootstrap();

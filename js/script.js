// js/script.js - shared by dashboard.html, details.html and post.html

// Prevent HTML injection from user-entered data
function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}


// ========================================
// DASHBOARD (dashboard.html)
// ========================================

function initDashboard() {

    const grid = document.getElementById("listingsGrid");
    if (!grid) return;

    const noResults = document.getElementById("noResults");
    const resultsCount = document.getElementById("resultsCount");
    const searchInput = document.getElementById("searchInput");
    const filterButtons = document.querySelectorAll(".filter-btn");

    let allItems = [];
    let activeCategory = "All";


    function createCard(item, index) {
        const btnClass = index === 0 ? "btn-primary" : "btn-secondary";

        return `
            <article class="listing-card" data-category="${escapeHtml(item.category)}">
                <div class="card-top">
                    <h3 class="card-title">${escapeHtml(item.item_name)}</h3>
                    <span class="category-badge">${escapeHtml(item.category)}</span>
                </div>
                <ul class="card-meta-list">
                    <li class="card-meta-item">
                        <span class="card-meta-label">Availability:</span>
                        <span class="card-meta-value">${escapeHtml(item.availability)}</span>
                    </li>
                    <li class="card-meta-item">
                        <span class="card-meta-label">Location:</span>
                        <span class="card-meta-value">${escapeHtml(item.location)}</span>
                    </li>
                    <li class="card-meta-item">
                        <span class="card-meta-label">Condition:</span>
                        <span class="card-meta-value">${escapeHtml(item.item_condition)}</span>
                    </li>
                </ul>
                <div class="card-footer">
                    <a href="details.html?id=${item.id}" class="btn ${btnClass}">View Details</a>
                </div>
            </article>
        `;
    }


    function render() {
        const query = searchInput.value.trim().toLowerCase();

        const filtered = allItems.filter((item) => {
            const matchesCategory =
                activeCategory === "All" || item.category === activeCategory;

            const matchesSearch =
                !query ||
                item.item_name.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query) ||
                item.location.toLowerCase().includes(query);

            return matchesCategory && matchesSearch;
        });

        grid.innerHTML = filtered.map(createCard).join("");

        // Keep the empty-state element inside the grid
        grid.appendChild(noResults);
        noResults.innerHTML = "<p><strong>No listings found</strong></p><p>Try searching for a different keyword or select another category.</p>";
        noResults.style.display = filtered.length === 0 ? "block" : "none";

        resultsCount.textContent =
            `Showing ${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
    }


    async function loadItems() {
        try {
            const response = await fetch("/api/items");
            if (!response.ok) throw new Error("Request failed");
            allItems = await response.json();
            render();
        } catch (error) {
            console.error(error);
            grid.innerHTML = "";
            resultsCount.textContent = "Could not load items";
            noResults.innerHTML = "<p><strong>Could not load items</strong></p><p>Make sure the server is running (node server.js).</p>";
            noResults.style.display = "block";
            grid.appendChild(noResults);
        }
    }


    searchInput.addEventListener("input", render);

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            filterButtons.forEach((b) => b.classList.remove("active"));
            button.classList.add("active");
            activeCategory = button.dataset.category;
            render();
        });
    });

    loadItems();
}


// ========================================
// ITEM DETAILS (details.html?id=)
// ========================================

function initDetails() {

    const card = document.querySelector(".detail-card");
    const borrowBtn = document.getElementById("borrowBtn");
    if (!card || !borrowBtn) return;

    const alertBox = document.getElementById("requestSuccessAlert");


    function showMessage(text) {
        card.innerHTML = `
            <h1 class="detail-title">${escapeHtml(text)}</h1>
            <div class="detail-actions">
                <a href="dashboard.html" class="btn btn-secondary">Back to Listings</a>
            </div>
        `;
    }


    function fillDetails(item) {
        document.title = `${item.item_name} | BorrowBox`;

        document.querySelector(".detail-title").textContent = item.item_name;
        document.querySelector(".detail-top-badges .category-badge").textContent = item.category;

        // Order in details.html: Category, Status, Condition, Available Until, Pickup Location
        const labels = document.querySelectorAll(".detail-meta-grid .meta-label");
        const values = document.querySelectorAll(".detail-meta-grid .meta-value");

        values[0].textContent = item.category;
        values[2].textContent = item.item_condition;
        labels[3].textContent = "Availability";
        values[3].textContent = item.availability;
        values[4].textContent = item.location;

        document.querySelector(".detail-description").textContent =
            item.description || "No description provided.";

        // Lender box: [0] Lender, [1] Contact
        const lenderValues = document.querySelectorAll(".lender-value");
        lenderValues[1].textContent = item.preferred_contact;

        // Optional image
        if (item.file_attachment) {
            const img = document.createElement("img");
            img.src = item.file_attachment;
            img.alt = item.item_name;
            img.style.cssText = "max-width:100%;border-radius:8px;margin-bottom:1.5rem;";
            document.querySelector(".detail-section-title").before(img);
        }

        // Request banner text
        const alertText = alertBox.querySelector("p");
        alertText.textContent =
            `Your request has been logged for this prototype demonstration. The lender has been notified at ${item.preferred_contact}.`;
    }


    async function loadDetails() {
        const id = new URLSearchParams(window.location.search).get("id");

        if (!id) {
            showMessage("No item selected");
            return;
        }

        try {
            const response = await fetch(`/api/items/${encodeURIComponent(id)}`);

            if (response.status === 404) {
                showMessage("Item not found");
                return;
            }

            if (!response.ok) throw new Error("Request failed");

            fillDetails(await response.json());
        } catch (error) {
            console.error(error);
            showMessage("Could not load item. Is the server running?");
        }
    }


    borrowBtn.addEventListener("click", () => {
        alertBox.style.display = "flex";
        borrowBtn.disabled = true;
        borrowBtn.textContent = "Request Sent";
        alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    loadDetails();
}


// ========================================
// POST AN ITEM (post.html)
// ========================================

function initPostForm() {

    const form = document.getElementById("postItemForm");
    if (!form) return;

    const alertBox = document.getElementById("postSuccessAlert");


    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const response = await fetch("/api/items", {
                method: "POST",
                body: new FormData(form)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not post item");
            }

            alertBox.querySelector("strong").textContent = "Item posted!";
            alertBox.querySelector("p").textContent =
                "Your listing is now live. Taking you back to the dashboard...";
            alertBox.style.display = "flex";
            alertBox.scrollIntoView({ behavior: "smooth", block: "center" });

            form.reset();

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1500);

        } catch (error) {
            console.error(error);
            window.alert(error.message);
            submitBtn.disabled = false;
        }
    });
}


initDashboard();
initDetails();
initPostForm();
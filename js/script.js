/**
 * BorrowBox - Client-Side JavaScript
 * Course: Integrated Programming Final Project (Group 2)
 * 
 * Note: This is a frontend prototype. All listings and actions use static
 * sample data and client-side interactions suitable for Phase 1.
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. PAGE: index.html - Search & Category Filter
  // =========================================================================
  const searchInput = document.getElementById('searchInput');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const listingCards = document.querySelectorAll('.listing-card');
  const resultsCount = document.getElementById('resultsCount');
  const noResultsMsg = document.getElementById('noResults');

  // Only run if we are on index.html where listings exist
  if (listingCards.length > 0) {
    let currentCategory = 'All';
    let currentSearchTerm = '';

    /**
     * Filters cards based on both current category and search term
     */
    function filterListings() {
      let visibleCount = 0;

      listingCards.forEach(card => {
        // Read card category and full text content
        const cardCategory = card.getAttribute('data-category') || '';
        const cardText = card.textContent.toLowerCase();

        // Check if category matches
        const matchesCategory = (currentCategory === 'All') || (cardCategory === currentCategory);

        // Check if search term matches any text in the card
        const matchesSearch = cardText.includes(currentSearchTerm);

        if (matchesCategory && matchesSearch) {
          card.style.display = 'flex';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Update visible count label
      if (resultsCount) {
        resultsCount.textContent = `Showing ${visibleCount} item${visibleCount === 1 ? '' : 's'}`;
      }

      // Show or hide "No items found" message
      if (noResultsMsg) {
        noResultsMsg.style.display = (visibleCount === 0) ? 'block' : 'none';
      }
    }

    // Event Listener: Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.trim().toLowerCase();
        filterListings();
      });
    }

    // Event Listener: Category Filter Buttons
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all buttons and set on clicked button
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentCategory = btn.getAttribute('data-category') || 'All';
        filterListings();
      });
    });
  }

  // =========================================================================
  // 2. PAGE: post.html - Form Submission Prototype
  // =========================================================================
  const postForm = document.getElementById('postItemForm');
  const formSuccessAlert = document.getElementById('postSuccessAlert');

  if (postForm) {
    postForm.addEventListener('submit', (e) => {
      e.preventDefault(); // Prevent standard page reload

      // Simple frontend validation check
      const itemName = document.getElementById('itemName')?.value.trim();
      const location = document.getElementById('location')?.value.trim();

      if (!itemName || !location) {
        alert('Please fill in the required fields before submitting.');
        return;
      }

      // Display the prototype success message
      if (formSuccessAlert) {
        formSuccessAlert.style.display = 'block';
        formSuccessAlert.scrollIntoView({ behavior: 'smooth' });
      }

      // Reset form fields
      postForm.reset();
    });
  }

  // =========================================================================
  // 3. PAGE: details.html - Request to Borrow Interaction
  // =========================================================================
  const borrowBtn = document.getElementById('borrowBtn');
  const requestSuccessAlert = document.getElementById('requestSuccessAlert');

  if (borrowBtn) {
    borrowBtn.addEventListener('click', () => {
      // Toggle / display confirmation notice
      if (requestSuccessAlert) {
        requestSuccessAlert.style.display = 'block';
        borrowBtn.textContent = 'Request Sent!';
        borrowBtn.disabled = true;
        borrowBtn.style.opacity = '0.7';
        borrowBtn.style.cursor = 'not-allowed';
      }
    });
  }

});

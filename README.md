# BorrowBox - Student-to-Student Borrowing Platform

> **Integrated Programming — Final Project (Phase 1: Frontend Prototype)**  
> **Course:** Integrated Programming  
> **Institution:** University of San Carlos (Talamban Campus)  
> **Group:** Final Project Group 2  

---

## Canvas Submission Information

- **Group Name:** Final Project Group 2
- **Project/System Title:** BorrowBox
- **Group Members:**
  - AL PHILLIPPE ABRENZOSA GARADO
  - DESIREE ANNE VILLARUEL GODINEZ
  - JAY NIÑO CLARK BONGO BASILGO
  - MAVERICK MOSES LOON ALIER
  - SIRACH ETHAN MALAZARTE NEMENZO
- **GitHub Repository Link:** https://github.com/Hubrisdog/IP-Project-BorrowBox-Group2

---

## Project Overview

**BorrowBox** is a lightweight, student-to-student borrowing platform designed specifically for campus life. Students frequently need an item for a short duration—such as a scientific calculator for an exam, an HDMI cable for a presentation, an umbrella during sudden rain, or a textbook—without wanting to purchase it.

BorrowBox provides a shared space where students can:
1. **Browse** items other students on campus are willing to lend.
2. **Post** an item they own that is temporarily available for borrowing.
3. **View details** of an item, including condition, availability window, campus pickup location, and lender contact.

*Note: BorrowBox is not a marketplace or e-commerce platform. Its core focus is temporary access and mutual student assistance rather than ownership or transactions.*

---

## Project Scope (Phase 1: Frontend Prototype)

This submission fulfills the requirements for the initial frontend prototype:
- Focuses strictly on user interface, layout, typography, and campus-oriented design.
- Uses static sample data representing realistic campus scenarios (e.g. Talamban Campus, Engineering Building, Library).
- Implements responsive, accessible layouts for both desktop and mobile screens.
- Written entirely in standard, beginner-friendly web technologies without frameworks or build tools.

### Technology Stack
- **HTML5:** Semantic markup (`<header>`, `<main>`, `<article>`, `<nav>`, `<footer>`)
- **CSS3:** Clean layout using Flexbox, CSS Grid, and CSS Custom Properties (Variables)
- **Vanilla JavaScript:** Simple client-side search filtering and category filtering

---

## Project Structure

```
BorrowBox/
├── index.html        # Browse page with live search & category filters
├── post.html         # Post an item listing form
├── details.html      # Detailed listing view (Scientific Calculator)
├── css/
│   └── style.css     # Clean collegiate stylesheet
├── js/
│   └── script.js     # Vanilla JS for live filtering & demo interactions
├── images/           # Asset directory
├── .gitignore        # Standard ignore rules
└── README.md         # Project documentation and submission details
```

---

## How to View the Project

No installation, Node.js, or build step is required:

### Option 1: Direct File Opening
Double-click `index.html` (or right-click and choose **Open With** -> your preferred web browser like Chrome, Firefox, or Edge).

### Option 2: Local HTTP Server (Python)
If you prefer running a local server:
```bash
cd BorrowBox
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

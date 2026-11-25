# AL-IMAAMA — School & Payment Management System

**Official Institution:** MADARASATUL AL-IMAAM (Hargeisa, Somaliland)  
**Technology Stack:** HTML5 · Tailwind CSS v4 · Vanilla JavaScript (ES6 Modules) · Vite · Lucide SVG Icons · SheetJS (`xlsx`) · jsPDF · JSZip

---

## Key Features

- **Role-Based Dashboards (Admin & Teacher)** with collapsible sidebar navigation, multi-language support (**English**, **Af-Soomaali**, **العربية** with automatic RTL mode), and **Strict Teacher Subject & Class Marks Access Control** enforced at both the authorization/data and routing/UI levels.
- **Student Records & Bulk Import** (`.xlsx` / `.csv` upload + manual registration & student profiles).
- **Classes, Subjects & Teacher Management** with dedicated class and subject assignments.
- **Daily Attendance Tracking & Attendance History** with printable attendance sheets.
- **Examinations, Marks Spreadsheet Entry, Class Ranking & Promotion Engine** with printable academic scorecards.
- **Student Certificates & Academic Transcripts Module** (Admin-only) to generate, preview, print, and export official student certificates and cumulative academic transcripts.
- **Fee & Payment Ledger, Receipts, Income & Expenses** with non-duplicated financial summaries.
- **Complete Reports Module (7 Categories · 25 Tailored Sub-Reports)** using authentic Madrasah terminology, dynamic filters, **Export Excel (`.xlsx`)**, **Export PDF**, and **Dedicated Individual A4 Portrait/Landscape Print Layouts**.
- **Complete Project Export (ZIP)** allowing Administrators to download clean project source code directly from the User Menu or System Settings.

---

## Local Setup & Running Instructions

### 1. Prerequisites
- **Node.js** `v18+` (recommended `v20+` or `v22+`)
- **npm** `v9+` (comes with Node.js)

### 2. Install Dependencies
Open a terminal in the extracted project folder and run:

```bash
npm install
```

### 3. Environment Variables (Optional)
An `.env.example` template is included with placeholder keys (no secrets are shipped in the archive). If you need environment variables locally:

```bash
cp .env.example .env
```

*(The core school management application runs out of the box without requiring external API keys.)*

### 4. Start Development Server
```bash
npm run dev
```
Then open **http://localhost:3000** in your web browser.

For backend authentication and live API data, start Django from `backend/` with
`python manage.py runserver` as well. Vite forwards `/api/v1` requests to
`http://127.0.0.1:8000` by default; set `VITE_API_PROXY_TARGET` in the Vite
process environment if Django listens on a different address. Production
deployments should route `/api/v1` to Django through their web server or hosting
platform, while the frontend continues to use same-origin API paths.

### 5. Build & Type-Check for Production
```bash
npm run lint
npm run build
npm run preview
```

---

## Demo Accounts

- **Administrator:** `admin@alimaama.demo` / `Admin123!`
- **Teacher:** `teacher@alimaama.demo` / `Teacher123!`

*(Also accessible via the 1-click **Admin Demo** and **Teacher Demo** buttons on the Login screen.)*

---

## Project Structure

```text
├── index.html                        # Application HTML entry point
├── package.json                      # Dependencies & npm scripts
├── vite.config.ts                    # Vite + Tailwind v4 configuration & ZIP archive plugin
├── tsconfig.json                     # TypeScript check configuration
├── metadata.json                     # App metadata
├── .env.example                      # Environment variable template (no secrets)
├── .gitignore                        # Git ignore rules
├── README.md                         # Setup & usage documentation
├── public/
│   └── assets/aistudio/
│       └── image_6159b039.png        # Official MADARASATUL AL-IMAAM logo
├── src/
│   ├── main.tsx                      # Vite entry bootstrap
│   ├── App.tsx                       # Root React mount bridge
│   ├── index.css                     # Entry stylesheet
│   └── vite-env.d.ts                 # Vite client & virtual module types
└── assets/
    ├── css/
    │   └── styles.css                # Tailwind v4 theme tokens, RTL & @media print rules
    └── js/
        ├── app.js                    # Application bootstrap
        ├── auth.js                   # Authentication & session state
        ├── components.js             # UI icons, modals, PDF/Excel/Print/ZIP helpers
        ├── data.js                   # Authorization-guarded queries, rankings & financials
        ├── i18n.js                   # EN / SO / AR translations & RTL controller
        ├── permissions.js            # RBAC matrix, teacher subject/class guards
        ├── router.js                 # SPA router, Auth screens & App shell
        ├── storage.js                # LocalStorage persistence & seed data
        ├── dashboard.js              # Admin & Teacher dashboards
        ├── students.js               # Student directory & profile views
        ├── student-import.js         # Bulk Excel/CSV student import
        ├── classes.js                # Class management
        ├── subjects.js               # Subject management
        ├── teachers.js               # Teacher directory & assignments
        ├── attendance.js             # Daily attendance marking
        ├── attendance-history.js     # Attendance history & logs
        ├── examinations.js           # Exams & strict subject/class marks spreadsheet
        ├── marks-history.js          # Marks audit history & subject/class filtering
        ├── results.js                # Term results & scorecards
        ├── promotion.js              # Class promotion workflow
        ├── certificates.js           # Admin-only Certificates & Academic Transcripts
        ├── payments.js               # Fee payments, receipts & income/expenses
        ├── reports.js                # 7-category / 25-subreport engine & print layouts
        ├── users.js                  # User account & role management
        └── settings.js               # System settings & backup controls
```

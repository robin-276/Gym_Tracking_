# 🏋️‍♂️ HEVY Coach - Premium Gym Management Dashboard

A comprehensive, full-stack Next.js web application designed specifically for personal trainers and gym owners[cite: 1]. This internal tool streamlines daily operations by managing client rosters, tracking workout progression, monitoring body metrics, and securing financial records in one centralized, real-time dashboard.

---

## ✨ Key Features

This platform replaces scattered spreadsheets and physical notebooks with a unified, relational database system.

* **👥 Client Roster Management:** Maintain an active roster with details on client goals, preferred training timings, and remaining session counts.
* **📈 Body Metrics Tracking:** Log and visualize weight, muscle mass, and body fat percentage changes over time to prove client ROI.
* **🏋️‍♀️ Smart Workout Logs:** Record daily sets, reps, and volume lifted. Includes a strict 24-hour edit lock to maintain the integrity of historical performance data.
* **💳 Secure Financial Ledger:** Log payments seamlessly. Financial records are strictly append-only (cannot be edited/deleted after saving) for perfect auditing purposes.
* **📚 Dynamic Exercise Library:** Curate and customize the exercises available for your clients, tagging them by specific muscle groups.

---

## 🛠 Tech Stack

* **Frontend:** Next.js (React), TypeScript, HTML/CSS
* **Backend & Database:** Supabase (PostgreSQL)
* **Typography:** Optimized with `next/font` using the Geist font family[cite: 1].
* **Deployment:** Vercel[cite: 1]

---

## 🚀 Getting Started

If you are a developer looking to run this project locally, follow these steps.

### 1. Clone the repository

\`\`\`bash
git clone `<your-github-repo-url>`
cd gym-tracker
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Environment Variables (Crucial Step)

You must **never** upload your database keys to GitHub. This project uses a local environment file to keep them safe.

1. Create a file named `.env.local` in the root folder of the project.
2. Add your Supabase project URL and Anon Key like this:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
\`\`\`

### 4. Database Setup

You will need to create the following relational tables in your Supabase SQL editor:

* `clients`
* `body_metrics`
* `payments`
* `exercise_library`
* `workout_logs`

### 5. Run the Development Server

Start the local server using your preferred package manager[cite: 1]:

\`\`\`bash
npm run dev

# or

yarn dev

# or

pnpm dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result[cite: 1]. You can start editing the dashboard by modifying `app/page.tsx`—the page will auto-update as you edit the file[cite: 1].

---

## 🌍 Deployment

The easiest and recommended way to deploy this Next.js app is to use the Vercel Platform[cite: 1].

1. Push your code to a GitHub repository.
2. Import the repository into Vercel.
3. Add your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel's **Environment Variables** section.
4. Click **Deploy**.

For more details on deployment strategies, check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying)[cite: 1].

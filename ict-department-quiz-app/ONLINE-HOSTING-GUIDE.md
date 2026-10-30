# Online hosting guide (Render)

## Important before publishing

This version uses a JSON file (`db.json`) for application records. It can keep that file on a Render persistent disk when `DATA_DIR=/var/data` is configured. Do **not** use a free Render web service for real student records: free services have an ephemeral filesystem and can spin down when idle. Render persistent disks are available only on paid services.

This remains a small pilot/demo setup, not a high-stakes production CBT deployment. The app currently uses Express's in-memory session store. A restart or redeploy logs users out and can interrupt an in-progress quiz. It also uses one JSON database file and is intended for one running server instance. Before official departmental examinations or larger simultaneous classes, migrate records and sessions to a managed database/session store such as PostgreSQL, add backups and audit logging, and test load and recovery.

## 1. Prepare the project

1. Keep the project folder on your Windows computer.
2. Do not upload `node_modules`, `.env`, `data/db.json`, or `data/uploads` to GitHub. The included `.gitignore` excludes these.
3. Create a private GitHub repository and publish the project folder contents. GitHub Desktop is a beginner-friendly way to do this.
4. Do not put real student records, passwords, or exam data in the Git repository.

## 2. Create the Render web service

1. Create/sign in to a Render account and connect your GitHub account.
2. In Render, choose **New → Web Service** and select your private quiz-app repository.
3. Use these settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance: choose a paid instance for a service that must stay available during examinations.
4. In the service's Environment settings, add:
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/var/data`
   - `SESSION_SECRET` = a long, random secret (generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
   - Do not manually set `PORT`; Render supplies it.
5. In the service's **Disks** section, add a persistent disk:
   - Mount path: `/var/data`
   - Size: start with 1 GB and increase when necessary.
6. Save and deploy. Wait for the deploy to become Live.
7. Open the Render-provided `https://...onrender.com` address.

## 3. First online login

The online service has its own separate data file. On its first start, it creates the initial administrator account:

- Email: `admin@ict.local`
- Password: `Admin123!`

Sign in and immediately change the password. Create the lecturer and student accounts again in the online system, then add courses and upload CSV question files. Your local database does not automatically synchronize with the online database. Keep the local and online records separate unless you implement a proper database migration/synchronization process.

## 4. Continue using the local version

- Double-click `START-ICT-QUIZ.bat`, or open a terminal in this folder and run `npm start`.
- Open `http://localhost:3000`.
- Local data is stored in this project's `data` folder by default.
- Keep the terminal window open while the local version is running.

## 5. Updating the online version

When you make code changes, publish/commit them to the same GitHub branch connected to Render. Render can automatically deploy the new version. The persistent disk keeps files under `/var/data` between deploys. However, a redeploy restarts the Node process and clears in-memory login sessions, so schedule updates outside examination hours.

## 6. Backups

Back up the persistent disk's `db.json` regularly before upgrades or examinations. The database contains student names, matriculation numbers, quiz attempts and results. Store backups securely; do not commit them to GitHub or share them publicly.

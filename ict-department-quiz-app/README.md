# ICT Department Quiz System

A starter web application for an ICT department with three roles:

- **Admin:** manages lecturer/student accounts, monitors quizzes and submissions, and controls when results are displayed to students.
- **Lecturer:** creates quizzes, imports many multiple-choice questions at once from a CSV or Excel workbook, and publishes quizzes for students.
- **Student/User:** signs in with a matriculation number, selects their registered department and course, takes matching published quizzes, and sees their own scores after the administrator releases the results.

The frontend uses HTML, CSS and vanilla JavaScript. The backend uses Node.js and Express. Data is stored locally in `data/db.json`, so there is no separate database server to install for this starter version.

## 1. Requirements

- Windows 10 or Windows 11
- Node.js 18.17 or newer (Node.js 20 LTS is recommended)
- Internet connection for the first installation of the Node packages
- A modern browser such as Chrome or Edge

## 2. Run the project on Windows

1. Extract the ZIP file into a folder, for example `C:\ICT-Quiz-App`.
2. Open that folder in File Explorer.
3. Click the folder address bar, type `cmd`, and press Enter. A Command Prompt will open in the project folder.
4. Check that Node.js is installed:

   ```bat
   node -v
   npm -v
   ```

5. Install the project packages (run this once):

   ```bat
   npm install
   ```

6. Start the application:

   ```bat
   npm start
   ```

7. Open this address in your browser:

   `http://localhost:3000`

Keep the Command Prompt window open while using the application. Press `Ctrl + C` in that window to stop the server.

## 3. First administrator login

The application creates one administrator account the first time it starts with an empty data store:

- Email: `admin@ict.local`
- Password: `Admin123!`

On the login screen choose **Administrator**, then sign in with the email and password above. Use **Change password** at the top of the page immediately. This is a starter login and must not be kept for real deployment.

The administrator can create lecturer and student accounts from the dashboard. For a student account, enter the student's full name, unique matriculation number, department and a temporary password. Students sign in with their matriculation number and password; lecturers and administrators continue to sign in with email and password. There is no open public registration page.

**Student departments included:** Information and Communication Technology (ICT), Computer Science, Computer Engineering, Software Engineering, Cyber Security, and Information Systems. The student's selected department must match the department assigned to their account by the administrator.

## 4. Lecturer: create courses, quizzes and upload questions

1. Ask the administrator to create your Lecturer account, then sign in with your email and password.
2. In **Add a course to the department catalogue**, choose the department and enter a course code and full course title. Example: `ICT 201` and `Introduction to Programming`.
3. Select **Add course**. The course is immediately added to the shared department catalogue and appears in the student login course dropdown.
4. In **Create a new quiz**, choose the department and select the course from the course dropdown. Enter a quiz title and duration, then select **Create quiz**.
5. Download the CSV template shown on the lecturer page, or prepare an Excel workbook. Upload the `.csv` or `.xlsx` file to the quiz.
6. Review the imported question count. You can upload more than one file to the same draft quiz. Select **Publish quiz** when it is ready.

### Managing courses

- All active courses are shared across lecturers in the department, so another lecturer can create a quiz for a course already in the catalogue without adding a duplicate.
- A lecturer can edit or remove courses they created. Editing a course updates its name/code on linked quizzes and historical attempts.
- A course cannot be removed while quizzes are linked to it. Edit the course instead, or keep it in the catalogue for future classes.
- Course codes must be unique within a department. The same code may be used in a different department.

A quiz must have at least one valid question before it can be published. A draft quiz accepts more than one import, so lecturers can upload a second file to add more questions before publishing. Each file can contain up to 500 questions and must be 5 MB or smaller.

### Required file headings

The first row must contain these headings (the order can be changed):

| Heading | What to enter |
|---|---|
| `question` | The question text |
| `optionA` | First answer option |
| `optionB` | Second answer option |
| `optionC` | Third answer option |
| `optionD` | Fourth answer option |
| `correctAnswer` | The correct option letter: `A`, `B`, `C` or `D` |
| `explanation` | Optional explanation shown in a future review feature; it is not shown during the quiz |

Do not merge cells or leave a required cell empty. Every non-empty question row needs four options and one correct answer letter.


## 5. Student: sign in with matriculation number and select a course

1. Ask the administrator to create your student account with your correct matriculation number and department.
2. On the login screen, choose **Student / User**.
3. Enter your matriculation number and password.
4. Select the department registered for your student account.
5. Select your course from the list of courses added by lecturers. Each option displays both the course code and title, for example `ICT 201 — Introduction to Programming`.
6. If your course is missing, contact a lecturer and ask them to add it to the course catalogue. The dropdown updates automatically after the course is added; students do not enter course codes manually.
7. You will only see published quizzes matching the selected department and course. Your matriculation number, department and course are saved with each submitted result.

## 6. Admin: display results

1. Sign in as the administrator.
2. The dashboard shows account totals, quizzes, attempts and average scores.
3. In **Quiz management and result release**, select **Display results** beside a quiz when results are ready to be released.
4. Students can then see their own score in the **My results** section. Select **Hide results** to hide them again.

The administrator can also enable or disable lecturer/student accounts. Disabling an account prevents that person from signing in.

## 7. Important notes about this starter version

- Results are calculated on the server; correct answers are not sent to the student's browser while taking a quiz.
- The time limit is checked by the server based on when the student opens the quiz. The timer is displayed in the student's browser.
- Multiple submissions are currently allowed for the same quiz. The admin dashboard counts each submission as an attempt.
- Student matriculation numbers must be unique. Existing student accounts created in an earlier version without matriculation numbers should be recreated by the administrator with a matriculation number and department.
- The local JSON data file stores users, courses, quizzes and attempts. It is suitable for learning and a small demonstration, not a high-traffic production deployment or multiple application servers. Back up `data/db.json` regularly.
- When upgrading from an earlier version, existing quizzes are automatically used to build the first course catalogue when the application starts. Keep your existing `data/db.json` file so your accounts, quizzes and results are retained.
- Before real institutional deployment, add HTTPS, a production session store, database backups, audit logs, stronger deployment configuration, and review the institution's privacy/security requirements. Do not expose this local development server directly to the public internet.
- This starter does not include email notifications, password reset by email, question randomization, downloadable report cards, or lecturer access to student results.

## 8. Common Windows issues

**`node` is not recognized:** install the current Node.js LTS release from the official Node.js website, keep the option to add Node to PATH enabled, close Command Prompt, open a new one, and retry `node -v`.

**`npm install` fails:** check your internet connection, then run `npm install` again from the folder containing `package.json`. Do not run it from a different folder.

**The browser says it cannot reach the site:** make sure `npm start` is still running and that the terminal says the app is running at `http://localhost:3000`. Check that another program is not already using port 3000. You can change the port by setting `PORT=3001` in a `.env` file, then use `http://localhost:3001`.

**You forgot the administrator password:** for a test installation only, stop the server, back up and remove `data/db.json`, then start the server again. This recreates the default admin account, but it also deletes all locally stored users, quizzes and results. Do not do this on a live system.


## 9. One-click Windows startup

After Node.js is installed and packages have been installed once, double-click `START-ICT-QUIZ.bat` to start the local application and open Chrome at `http://localhost:3000`. Keep the black terminal window open while using the app.

## 10. Online hosting

This release can write its JSON data and upload working files to a configured data directory. For Render, attach a **paid persistent disk** mounted at `/var/data`, set `DATA_DIR=/var/data`, `NODE_ENV=production`, and a strong `SESSION_SECRET`, then use `npm install` as the build command and `npm start` as the start command. See `ONLINE-HOSTING-GUIDE.md` for the complete steps. Do not use an ephemeral free service for real records.

This is still a small pilot/demo deployment: sessions are stored in memory and the application uses one JSON data file. Server restarts log users out and can interrupt a live quiz. Before official or high-volume exams, migrate application data and sessions to PostgreSQL (or another production database/session store), add backups and audit logging, and perform load/security testing. Local and online data are separate and do not automatically synchronize.
